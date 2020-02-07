const server = require('@streamr/server');
const Engine = require('@streamr/engine');
const HLS = require('@streamr/hls');

const torrentStream = require('torrent-stream');

const port = process.env.PORT || 3000;

server.context.port = port;

// expose our engine to our server
server.context.engine = new Engine({
  engine: torrentStream
});

server.context.hls = new HLS();

server.listen(port);
console.log('🚀 Server ready at http://localhost:%s/', port);
