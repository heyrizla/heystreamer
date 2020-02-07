const server = require('@streamr/server');
const Engine = require('@streamr/engine');
const HLS = require('@streamr/hls');

const torrentStream = require('torrent-stream');

const port = process.env.PORT || 3000;

const hls = new HLS();

console.log(hls.executables);

// expose our engine to our server
server.context.engine = new Engine({
  engine: torrentStream
});

server.listen(port);
console.log('🚀 Server ready at http://localhost:%s/', port);
