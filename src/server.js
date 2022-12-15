/**
 * @type {any}
 */
const WebSocket = require('ws')
const http = require('http')
const wss = new WebSocket.Server({ noServer: true })
const setupWSConnection = require('../bin/utils.js').setupWSConnection

/**
 * @param {any} opts
 */
const createServer = ({ authenticate } = {}) => {
  const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' })
    response.end('okay')
  })

  wss.on('connection', (conn, req, { docName = req.url.slice(1).split('?')[0], gc = true } = {}) => {
    conn.authenticated = false
    conn.req = req
    conn.docName = docName
    conn.gc = gc
    conn.on('message', message => {
      onMessage(conn, conn.doc, message)
    })
  })

  const onMessage = async (conn, doc, message) => {
    if (typeof message === 'string') {
      let json
      try {
        json = JSON.parse(message)
        if (!json.auth) {
          console.error('auth required')
          return
        }

        /** Secures a message endpoint. */
        // const secure = () => {
        //   if (!authenticate(json.auth, conn.docName)) {
        //     conn.send('access-denied')
        //     return false
        //   }
        //   return true
        // }

        switch (json.type) {
          case 'auth':
            // noop endpoint
            // handled in authenticate
            break
          default:
            break
        }
      } catch (e) {
        console.error('invalid json', message)
        return
      }

      conn.authenticated = authenticate(conn.docName, json.auth)

      if (conn.authenticated) {
        console.log('authenticated:', json.auth)
        conn.send('authenticated')
        setupWSConnection(conn, conn.req, { docName: conn.docName, gc: conn.gc })
      } else {
        console.log('access denied:', json.auth)
        conn.send('access-denied')
        conn.close()
      }
    } else if (conn.authenticated) {
      // console.log('onMessage: authenticated')
      // this._onCollabMessage(conn, doc, new Uint8Array(message))
    } else {
      console.log('not authenticated')
    }
  }

  server.on('upgrade', (request, socket, head) => {
    // You may check auth of request here..
    // See https://github.com/websockets/ws#client-authentication
    /**
     * @param {any} ws
     */
    const handleAuth = ws => {
      wss.emit('connection', ws, request)
    }
    wss.handleUpgrade(request, socket, head, handleAuth)
  })

  return server
}

export default createServer
