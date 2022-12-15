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
const createServer = ({ authenticate, routes } = {}) => {
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
    // Ignore non-string messages, i.e. ArrayBuffer sync updates. They are handled by messageListener.
    if (typeof message !== 'string') return

    let json
    try {
      json = JSON.parse(message)
    } catch (e) {
      console.error('invalid json', message)
      conn.send('invalid json')
      return
    }

    if (!json.auth) {
      console.error('auth required', json)
      conn.send('auth required in every message')
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
        // json.auth parsed in every request (below)
        break
      default:
        if (routes) {
          if (!routes[json.type]) {
            console.error('Invalid route', json.type)
            conn.send('invalid route')
          }
          conn.send(JSON.stringify(routes[json.type](json)))
        } else {
          console.error('no routes')
          conn.send('no routes')
          return
        }
        break
    }

    const authenticated = authenticate(conn.docName, json.auth)

    if (!authenticated) {
      conn.authenticated = false
      console.error('access denied:', json)
      conn.send('access-denied')
      conn.close()
    } else if (!conn.authenticated) {
      // first time authentication
      // Does this need to be executed again after a disconnection?
      conn.authenticated = true
      conn.send('authenticated')
      setupWSConnection(conn, conn.req, { docName: conn.docName, gc: conn.gc })
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
