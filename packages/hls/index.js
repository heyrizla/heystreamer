const path = require('path');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');
const asyncQueue = require('async/queue');

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

    this.paths = [];
    this.executables = this.locateAllExecutables();

    // convert queue handler
    this.convertQueue = asyncQueue((task, cb) => {
      task(cb);
    }, this.parallelConverts);

    this.convertQueue.saturated = () => {
      console.log(
        `WARNING: convertQueue saturated with concurrency: ${
          convertQueue.concurrency
        } and tasks: ${convertQueue.length()}`
      );
    };
  }

  thumbMiddleware = function(req, res) {
    videoapi.probeVideo(req.params.from, function(err, instance) {
      if (err) return common.handleErr(err, res);

      var args = [
        '-ss',
        !isNaN(req.query.at) ? req.query.at : Math.round(instance.duration / 1000 / 2), // Why the fuck can't we use toSecs? it gets stuck in this case. Maybe could be an issue with transmux too
        '-i',
        req.params.from,
        '-r',
        '1',
        '-vframes',
        '1',
        '-f',
        'image2',
        '-vcodec',
        'mjpeg',
        'pipe:1'
      ];

      common.serveFfmpeg(args, 'image/jpg', res);
    });
  };

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
