const { EventEmitter } = require('events');
const { _extend } = require('util');
const os = require('os');
const path = require('path');

const PeerSearch = require('peer-search');

const IH_REGEX = new RegExp('([0-9A-Fa-f]){40}', 'g');
const DEFAULTS = ih => {
  return {
    peerSearch: {
      min: 40,
      max: 150,
      sources: [
        'tracker:udp://tracker.opentrackr.org:1337/announce',
        'tracker:udp://tracker.coppersurfer.tk:6969/announce',
        'tracker:udp://tracker.leechers-paradise.org:6969',
        'tracker:udp://tracker.zer0day.to:1337/announce',
        'tracker:udp://9.rarbg.me:2710',
        'dht:' + ih
      ]
    },
    dht: false,
    tracker: false, // LEGACY ARGS, disable because we use peerSearch
    connections: 35,
    handshakeTimeout: 20000,
    timeout: 4000,
    virtual: true,
    swarmCap: { minPeers: 5, maxSpeed: 10 * 1024 * 1024 },
    growler: { flood: 0, pulse: 2.5 * 1024 * 1024 }
    //storageMemoryCache: 25*1024*1024, // 25M in-memory cache; WARNING: This has to hold off writing to disk for 25MB, in order to avoid Windows I/O issue encountered in 2014/2015 testing and solved with writeQueue pause/resume
  };
};

class Engine extends EventEmitter {
  constructor(opts) {
    super();
    this.engine = opts && opts.engine ? opts.engine : null;
    this.streamTimeout = opts && opts.streamTimeout ? opts.streamTimeout : 30 * 1000;
    this.engineTimeout = opts && opts.engineTimeout ? opts.engineTimeout : 60 * 1000;

    this.engines = [];
    this.counter = [];
    this.timeouts = [];

    this.on('engine-created', hash => {
      console.log(`Engine created for ${hash}`);
    });

    this.on('engine-destroyed', hash => {
      console.log(`Engine ${hash} destroyed`);
    });

    this.on('engine-idle', hash => {
      console.log(`Engine ${hash} is idle, pausing swarm`);
      this.settings(hash, { swarm: 'PAUSE' });
    });

    this.on('engine-inactive', hash => {
      console.log(`Engine ${hash} is inactive, destroying it`);
      this.remove(hash);
    });

    this.on('engine-error', (hash, err) => {
      console.error(`Engine error for ${hash}`);
      console.error(err);
    });

    this.on('engine-invalid-piece', (hash, p) => {
      console.error(`Engine invalid piece ${p} for ${hash}`);
    });

    // counters
    this.on('stream-open', (hash, idx) => {
      // hash:idx
      const id = `${hash}:${idx}`;
      if (!this.counter.hasOwnProperty(id)) {
        this.counter[id] = 0;
        this.emit(`stream-active:${id}`);
        this.emit('stream-active', id);
      }

      this.counter[id]++;

      if (this.timeouts[id]) {
        clearTimeout(this.timeouts[id]);
        delete this.timeouts[id];
      }

      // hash only
      if (!this.counter.hasOwnProperty(hash)) {
        this.counter[hash] = 0;
        this.emit(`stream-active:${hash}`);
        this.emit('stream-active', hash);
      }

      this.counter[hash]++;

      if (this.timeouts[hash]) {
        clearTimeout(this.timeouts[hash]);
        delete this.timeouts[hash];
      }
    });

    this.on('stream-close', (hash, idx) => {
      // hash:idx
      const id = `${hash}:${idx}`;
      this.counter[id]--;
      if (this.counter[id] === 0) {
        if (this.timeouts[id]) {
          clearTimeout(timeouts[id]);
        }

        this.timeouts[id] = setTimeout(() => {
          this.emit(`stream-inactive:${id}`);
          this.emit('stream-inactive', id);
          delete this.counter[id];
          delete this.timeouts[id];
        }, this.streamTimeout);
      }

      // hash only
      this.counter[hash]--;
      if (this.counter[hash] === 0) {
        if (this.timeouts[hash]) {
          clearTimeout(timeouts[hash]);
        }

        this.timeouts[hash] = setTimeout(() => {
          this.emit(`engine-inactive:${hash}`);
          this.emit('engine-inactive', hash);
          delete this.counter[id];
          delete this.timeouts[id];
        }, this.engineTimeout);
      }
    });

    this.on('stream-created', hash => {
      // hash only
      if (!this.counter.hasOwnProperty(hash)) {
        this.counter[hash] = 0;
      }

      this.counter[hash]++;

      if (this.timeouts[hash]) {
        clearTimeout(this.timeouts[hash]);
        delete this.timeouts[hash];
      }
    });

    this.on('stream-cached', hash => {
      this.counter[hash]--;
      if (this.counter[hash] === 0) {
        if (this.timeouts[hash]) {
          clearTimeout(timeouts[hash]);
        }

        this.timeouts[hash] = setTimeout(() => {
          this.emit(`engine-idle:${hash}`);
          delete this.counter[id];
          delete this.timeouts[id];
        }, this.streamTimeout);
      }
    });

    this.on('stream-open', (infoHash, fileIndex) => {
      const currentEngine = this.getEngine(infoHash);

      currentEngine.ready(() => {
        const file = currentEngine.torrent.files[fileIndex];

        if (file.__cacheEvents) {
          return;
        }

        file.__cacheEvents = true;

        this.emit('stream-created', infoHash, fileIndex, file);

        let startPiece = (file.offset / currentEngine.torrent.pieceLength) | 0;
        let endPiece = ((file.offset + file.length - 1) / currentEngine.torrent.pieceLength) | 0;

        const fpieces = [];
        for (let i = startPiece; i <= endPiece; i++) {
          if (!currentEngine.bitfield.get(i)) {
            fpieces.push(i);
          }
        }

        const filePieces = Math.ceil(file.length / currentEngine.torrent.pieceLength);

        const onDownload = p => {
          if (p !== undefined) {
            const idx = fpieces.indexOf(p);
            if (idx == -1) {
              return;
            }
            fpieces.splice(idx, 1);
          }

          const fpath = currentEngine.store.getDest && currentEngine.store.getDest(fileIndex);

          this.emit(
            `stream-progress:${infoHash}:${fileIndex}`,
            (filePieces - fpieces.length) / filePieces,
            fpath
          );

          if (fpieces.length) {
            return;
          }

          // getDest not supported in all torrent-stream versions
          this.emit(`stream-cached:${infoHash}:${fileIndex}`, fpath, file);
          this.emit('stream-cached', infoHash, fileIndex, fpath, file);

          currentEngine.removeListener('download', onDownload);
          currentEngine.removeListener('verify', onDownload);

          // should we transcode?
        };

        currentEngine.on('verify', onDownload);

        // initial call in case file is already done
        onDownload();

        /* New torrent-stream writes pieces only when they're verified, which means virtuals are
         * not going to be written down, which means we have a change to play a file without having it
         * fully commited to disk; make sure we do that by downloading the entire file in verified pieces
         *
         * Plus, we always guarantee we have the whole file requested
         */
        const vLen = currentEngine.torrent.realPieceLength || currentEngine.torrent.verificationLen;
        startPiece = (file.offset / vLen) | 0;
        endPiece = ((file.offset + file.length - 1) / vLen) | 0;

        const ratio = vLen / currentEngine.torrent.pieceLength;
        if (!currentEngine.buffer) {
          currentEngine.select(startPiece * ratio, (endPiece + 1) * ratio, false);
        }
      });
    });
  }

  getDefaults(ih) {
    return DEFAULTS(ih);
  }

  getEngine(infoHash) {
    return this.engines[infoHash.toLowerCase()];
  }

  getCachePath(infoHash) {
    return path.join(os.tmpdir(), infoHash);
  }

  exists(infoHash) {
    return !!this.engines[infoHash.toLowerCase()];
  }

  remove(infoHash) {
    if (!this.engines[infoHash]) {
      return;
    }

    this.engines[infoHash].destroy(() => {
      this.emit(`engine-destroyed:${infoHash}`);
    });

    delete this.engines[infoHash];
  }

  settings(infoHash, settings) {
    const e = this.engines[infoHash];
    if (!e) {
      return;
    }
    if (settings.hasOwnProperty('writeQueue') && e.store.writequeue)
      e.ready(function() {
        if (settings.writeQueue == 'PAUSE') {
          e.store.writequeue.pause();
          setTimeout(function() {
            e.store.writequeue.resume();
          }, 50 * 1000); // Done for safety reasons
        } else e.store.writequeue.resume(); // no need for ready, since it's by default resumed
      });

    if (settings.swarm == 'PAUSE') e.swarm.pause();
    if (settings.swarm == 'RESUME') e.swarm.resume();
  }

  stats(infoHash, idx) {
    if (!this.engines[infoHash]) return null;
    return this.getStatistics(this.engines[infoHash], idx);
  }

  list() {
    return Object.keys(this.engines);
  }

  getStreamStats(e, file) {
    const stats = {};

    stats.streamLen = file.length;
    stats.streamName = file.name;

    const startPiece = (file.offset / e.torrent.pieceLength) | 0;
    const endPiece = ((file.offset + file.length - 1) / e.torrent.pieceLength) | 0;
    const availablePieces = 0;
    for (let i = startPiece; i <= endPiece; i++) {
      if (e.bitfield.get(i)) {
        availablePieces++;
      }
    }

    const filePieces = Math.ceil(file.length / e.torrent.pieceLength);
    stats.streamProgress = availablePieces / filePieces;

    return stats;
  }

  getStatistics(e, idx) {
    if (!e) return null;
    const s = {
      infoHash: e.infoHash,

      name: e.torrent && e.torrent.name,

      peers: e.swarm.wires.length,
      unchoked: e.swarm.wires.filter(function(peer) {
        return !peer.peerChoking;
      }).length,
      queued: e.swarm.queued,
      unique: Object.keys(e.swarm._peers).length,

      connectionTries: e.swarm.tries,
      swarmPaused: e.swarm.paused,
      swarmConnections: e.swarm.connections.length,
      swarmSize: e.swarm.size,

      selections: e.selection,
      wires:
        idx !== undefined
          ? null
          : e.swarm.wires
              .filter(function(peer) {
                return !peer.peerChoking;
              })
              .map(function(wire) {
                return {
                  requests: wire.requests.length,
                  address: wire.peerAddress,
                  amInterested: wire.amInterested,
                  isSeeder: wire.isSeeder,
                  downSpeed: wire.downloadSpeed(),
                  upSpeed: wire.uploadSpeed()
                };
              }),

      files: e.torrent && e.torrent.files,

      downloaded: e.swarm.downloaded,
      uploaded: e.swarm.uploaded,

      downloadSpeed: e.swarm.downloadSpeed(),
      uploadSpeed: e.swarm.downloadSpeed(),

      sources: e.swarm.peerSearch && e.swarm.peerSearch.stats(),
      peerSearchRunning: e.swarm.peerSearch ? e.swarm.peerSearch.isRunning() : undefined,

      opts: e.options

      //dht: !!e.dht,
      //dhtPeers: e.dht ? Object.keys(e.dht.peers).length : null,
      //dhtVisited: e.dht ? Object.keys(e.dht.visited).length : null
    };
    // TODO: better stream-specific data; e.g. download/uploaded should only be specific to this stream

    if (!isNaN(idx) && e.torrent && e.torrent.files[idx]) {
      _extend(s, this.getStreamStats(e, e.torrent.files[idx]));
    }

    return s;
  }

  updateSwarmCap(e, opts) {
    let primaryCond = true;

    const unchoked = e.swarm.wires.filter(function(peer) {
      return !peer.peerChoking;
    }).length;

    // Policy note: maxBuffer simply overrides maxSpeed; we may consider adding a "primaryCond ||" on the second line, also factoring in maxSpeed
    if (opts.maxSpeed) {
      primaryCond = e.swarm.downloadSpeed() > opts.maxSpeed;
    }
    if (opts.maxBuffer) {
      primaryCond = calcBuffer(e) > opts.maxBuffer;
    }

    const minPeerCond = unchoked > opts.minPeers;

    if (primaryCond && minPeerCond) {
      e.swarm.pause();
    } else {
      e.swarm.resume();
    }
  }

  async openPath(path) {
    // length: 40 ; info hash
    const parts = path.split('/').filter(part => part);

    if (parts[0] && parts[0].match(IH_REGEX)) {
      const infoHash = parts[0].toLowerCase();
      const i = Number(parts[1]);

      if (isNaN(i)) {
        throw new Error('Cannot parse path: info hash received, but invalid file index');
      }

      try {
        const engine = await this.create(infoHash);
        if (!engine.files[i]) {
          throw new Error(`Torrent does not contain file with index ${i}`);
        }

        return {
          file: engine.files[i],
          engine
        };
      } catch (error) {
        throw error;
      }
    }

    // length: 64 ; Linvo Hash ; TODO
    if (parts[0] && parts[0].length == 64) {
      throw new Error('Not available yet');
    }

    throw new Error('Cannot parse hash');
  }

  create(infoHash = '', options = {}) {
    return new Promise((resolve, reject) => {
      let realOptions = options;

      if (!this.engine) {
        reject('No engine set');
      }

      this.on(`engine-ready:${infoHash}`, () => {
        resolve(this.engines[infoHash]);
      });

      realOptions = _extend(this.getDefaults(infoHash), options || {});
      realOptions.path = realOptions.path || this.getCachePath(infoHash);

      this.emit(`engine-create:${infoHash}:${options}`);

      const torrent = realOptions.torrent || 'magnet:?xt=urn:btih:' + infoHash;

      const isNew = !this.engines[infoHash];
      const currentEngine = (this.engines[infoHash] =
        this.engines[infoHash] || this.engine(torrent, options));
      // In case it's paused
      currentEngine.swarm.resume();

      // needed for stats
      currentEngine.options = realOptions;

      if (isNew && realOptions.peerSearch) {
        new PeerSearch(realOptions.peerSearch.sources, currentEngine.swarm, realOptions.peerSearch);
      }

      if (isNew && realOptions.swarmCap) {
        const updater = this.updateSwarmCap.bind(null, currentEngine, realOptions.swarmCap);
        currentEngine.swarm.on('wire', updater);
        currentEngine.swarm.on('wire-disconnect', updater);
        currentEngine.on('download', updater);
      }

      if (realOptions.growler && currentEngine.setFloodedPulse) {
        currentEngine.setFloodedPulse(realOptions.growler.flood, realOptions.growler.pulse);
      }

      if (isNew) {
        currentEngine.on('error', err => {
          this.emit(`engine-error:${infoHash}`, err);
          this.emit('engine-error', infoHash, err);
        });

        currentEngine.on('invalid-piece', p => {
          this.emit(`engine-invalid-piece:${infoHash}`, p);
          this.emit('engine-invalid-piece', infoHash, p);
        });

        this.emit(`engine-created:${infoHash}`);
        this.emit('engine-created', infoHash);
      }

      currentEngine.ready(() => {
        this.emit(`engine-ready:${infoHash}`, currentEngine.torrent);
        this.emit('engine-ready', infoHash, currentEngine.torrent);
      });
    });
  }
}

module.exports = Engine;
