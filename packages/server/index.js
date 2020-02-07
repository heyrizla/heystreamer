const koa = require('koa');
const router = require('./router');

// boot the koa server
const server = new koa();

// error handling
server.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    // will only respond with JSON
    ctx.status = err.statusCode || err.status || 500;
    ctx.body = {
      message: err.message
    };
  }
});

// CORS headers
server.use(async (ctx, next) => {
  // Allow CORS requests to specify byte ranges.
  // The `Range` header is not a "simple header", thus the browser
  // will first send OPTIONS request and check Access-Control-Allow-Headers
  // before allowing additional requests.

  if (ctx.req.method === 'OPTIONS' && ctx.headers.origin) {
    ctx.set('Access-Control-Allow-Origin', '*');
    ctx.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    ctx.set(
      'Access-Control-Allow-Headers',
      ctx.headers['access-control-request-headers'] || 'Range'
    );
    ctx.set('Access-Control-Max-Age', '1728000');
  } else if (ctx.headers.origin) {
    ctx.set('Access-Control-Allow-Origin', '*');
  }

  await next();
});

// bind the routing
server.use(router.routes());

module.exports = server;
