const rangeParser = require('range-parser');
const mime = require('mime');
const { _extend } = require('util');

module.exports = async ctx => {
  const { path: pathName } = ctx.request;

  try {
    const { engine, file } = await ctx.engine.openPath(pathName);
    const opts = {};

    let closed = false;
    const emitClose = () => {
      if (closed) {
        return;
      }
      closed = true;
      ctx.engine.emit('stream-close', engine.infoHash, engine.files.indexOf(file));
    };

    ctx.engine.emit('stream-open', engine.infoHash, engine.files.indexOf(file));

    ctx.res.on('finish', emitClose);
    ctx.res.on('close', emitClose);

    ctx.request.socket.setTimeout(24 * 60 * 60 * 1000);

    let range = ctx.headers.range;
    range = range && rangeParser(file.length, range)[0];
    ctx.set('Accept-Ranges', 'bytes');
    ctx.set('Cache-Control', 'max-age=0, no-cache');

    // DLNA headers
    ctx.set('transferMode.dlna.org', 'Streaming');
    ctx.set(
      'contentFeatures.dlna.org',
      'DLNA.ORG_OP=01;DLNA.ORG_CI=0;DLNA.ORG_FLAGS=017000 00000000000000000000000000'
    );

    ctx.type = mime.getType(file.name);

    if (ctx.headers['X-Priority']) {
      opts.priority = parseInt(ctx.headers['X-Priority']) || 1;
    }

    if (!range) {
      ctx.set('Content-Length', file.length);

      if (ctx.request.method === 'HEAD') {
        return;
      }

      ctx.body = file.createReadStream(opts);
      return;
    }

    ctx.status = 206;
    ctx.set('Content-Length', range.end - range.start + 1);
    ctx.set('Content-Range', `bytes ${range.start}-${range.end}/${file.length}`);

    if (ctx.request.method === 'HEAD') {
      return;
    }
    ctx.body = file.createReadStream(_extend(range, opts));
  } catch (error) {
    throw error;
  }
};
