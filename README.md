# streamr

Simple layer to use and manage torrent-stream engines and access them through HTTP / FUSE.

Somewhat similar to peerflix-server, but allows more sophisticated management, such as automatically closing torrent-stream's after some time of inactivity, full HLS support with ffmpeg live transcoding when required.

Not ready for production yet.

## Example:

```javascript
yarn dev

// Stream Big Buck Bunny
// vlc http://localhost:3000/2f24d03eab998ca672b8c1ef567a184609236c02/0

// Stream Wizard Of Oz
// vlc http://localhost:3000/24c8802e2624e17d46cd555f364debd949f2c81e/0
```
