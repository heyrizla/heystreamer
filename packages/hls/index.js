const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');
const asyncQueue = require('async/queue');
const child = require('child_process');
const once = require('once');
const byline = require('byline');

const defaultSearchPaths = {
  ffmpeg: [
    ffmpegPath,
    path.dirname(process.execPath) + '/ffmpeg',
    path.dirname(process.execPath) + '\\ffmpeg.exe',
    path.dirname(process.execPath) + '\\bin\\ffmpeg.exe'
  ],
  ffsplit: [
    path.join(__dirname, './node_modules/stremio-ffsplit-prebuilt/bin/ffsplit.bin'),
    process.env.HOME + '/hls-segment-splitter/ffsplit.bin', // TESTING
    path.dirname(process.execPath) + '\\bin\\ffsplit.exe'
  ]
};

class HLS {
  constructor(opts) {
    this.searchPaths = opts && opts.searchPaths ? opts.searchPaths : defaultSearchPaths;
    this.parallelConverts = opts && opts.parallelConverts ? opts.parallelConverts : 200;
    this.probeTimeout = opts && opts.probeTimeout ? opts.probeTimeout : 20 * 1000;

    this.paths = [];
    this.executables = this.locateAllExecutables();

    // convert queue handler
    this.convertQueue = asyncQueue((task, cb) => {
      task(cb);
    }, this.parallelConverts);
  }

  async probeVideo(video) {
    return new Promise((resolve, reject) => {
      if (!this.paths.ffmpeg) {
        return reject('no ffmpeg found; call HLS.locateExecutables()');
      }

      let probeTimeout;
      const res = { streams: [] };
      let err = null;

      const ffmpegProcess = child.spawn(this.paths.ffmpeg, ['-i', video]);

      const ready = once(() => {
        if (probeTimeout) {
          clearTimeout(probeTimeout);
        }
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      });

      probeTimeout = setTimeout(() => {
        err = { message: `cannot probe within ${PROBE_TIMEOUT}`, statusCode: 504 };
        ready();
        ffmpegProcess.kill('SIGKILL');
      }, this.probeTimeout);

      // TODO: respect arg ffmpeg-debug
      if (process.env.FFMPEG_DEBUG) {
        ffmpegProcess.stderr.pipe(process.stderr);
      }

      let parsing = false;
      byline
        .createStream(ffmpegProcess.stderr)
        .on('data', function(lineData) {
          const line = lineData.toString();
          if (line.match('Input #0')) {
            parsing = true;
            const containers = line
              .toLowerCase()
              .split(/\s*,\s*/)
              .slice(1, -1);
            if (containers.indexOf('mp4') >= 0) {
              res.container = 'mp4';
            } else if (containers.indexOf('matroska') >= 0) {
              res.container = 'matroska';
            } else {
              res.container = containers[0];
            }
            return;
          }
          if (parsing && line[0] != ' ') {
            parsing = false;
            return;
          }
          if (parsing) {
            const durMatch = line.match(/Duration: (\d\d):(\d\d):(\d\d(\.\d\d)?)/i);
            if (durMatch) {
              res.duration =
                parseFloat(durMatch[1]) * 60 * 60 * 1000 +
                parseFloat(durMatch[2]) * 60 * 1000 +
                parseFloat(durMatch[3]) * 1000;
              const bitrateMatch = line.match(/bitrate: (\d+)/i);
              if (bitrateMatch) {
                res.bitrate = parseInt(bitrateMatch[1], 10) * 1000;
              }
            }

            const streamMatch = line.match(/Stream #0:(\d\d?)(?:\((\w+)\))?/);
            if (streamMatch) {
              const streamParts = line.split(/\s*:\s*/);
              const codecParts = streamParts[3].split(/ |,/);
              const dimParts = streamParts[3].match(/([0-9]{3,4})x([0-9]{3,4})/);
              const fpsMatch = line.match(/([0-9]{2})(\.)?([0-9]{2})? fps/);
              const bitrateMatch = line.match(/([0-9]{3,4}) kb\/s/);
              res.streams[streamMatch[1]] = {
                codecType: streamParts[2].toLowerCase(),
                codecName: codecParts[0].toLowerCase(),
                size: dimParts ? [parseInt(dimParts[1], 10), parseInt(dimParts[2], 10)] : null,
                stream: parseInt(streamMatch[1]),
                default: codecParts.indexOf('(default)') >= 0,
                bitrate: bitrateMatch ? parseInt(bitrateMatch[0], 10) * 1000 : null,
                fps: fpsMatch ? parseFloat(fpsMatch[0]) : null,
                lang: streamMatch[2]
              };
            }
          }
        })
        .on('finish', function() {
          if (res.duration) {
            err = null;
          }
          console.log(res, err);
          ready();
        });

      ffmpegProcess.on('exit', function(code) {
        if (code !== 0) {
          err = { code: code, message: 'process exited with bad code: ' + code };
        }
      });

      ffmpegProcess.on('error', function(e) {
        err = e;
      });
    });
  }

  setParallelConverts(converts) {
    this.convertQueue.concurrency = converts;
  }

  locateAllExecutables() {
    Object.keys(this.searchPaths).forEach(name => {
      this.paths[name] = this.locateExecutable(name, this.searchPaths[name]) || this.paths[name];
    });

    return this.paths;
  }

  locateExecutable(name, searchIn) {
    const sysPaths = process.env.PATH.split(path.delimiter).map(dir => {
      return path.join(dir, name);
    });

    return (searchIn || []).concat(sysPaths).find(p => {
      try {
        fs.accessSync(p, fs.X_OK);
        return true;
      } catch (e) {
        return false;
      }
    });
  }
}

module.exports = HLS;
