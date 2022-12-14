#!/usr/bin/env node

/**
 * @type {any}
 */
const Y = require('yjs')
const WebSocket = require('ws')
const http = require('http')
const wss = new WebSocket.Server({ noServer: true })
const setupWSConnection = require('./utils.js').setupWSConnection

const host = process.env.HOST || 'localhost'
const port = process.env.PORT || 1234
const permissionsDir = process.env.PERMISSIONS_DIR || './.permissions.level'

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' })
  response.end('okay')
})

/**
 * Per-document permissions. Persisted to PERMISSIONS_DIR (default: .permissions.level)
 *
 * @example
 *   {
 *     [docid]: {
 *       [accessToken]: [role]
 *     }
 *   }
*/
const docName = 'permissions'
const ydoc = new Y.Doc()
const yPermissions = ydoc.getMap(docName)
const LeveldbPersistence = require('y-leveldb').LeveldbPersistence
const ldb = new LeveldbPersistence(permissionsDir)
;(async () => {
  const persistedYdoc = await ldb.getYDoc('permissions')
  const newUpdates = Y.encodeStateAsUpdate(ydoc)
  ldb.storeUpdate(docName, newUpdates)
  Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc))
  ydoc.on('update', update => {
    ldb.storeUpdate(docName, update)
  })
})()

/** Authenticates the access token. */
const authenticate = (docid, accessToken, { permission } = {}) => {
  const docPermissions = yPermissions.get(docid)
  console.log({ docPermissions })

  // if the document has no owner, automatically assign the current user as owner
  if (!docPermissions) {
    console.log('assigning owner')
    yPermissions.set(docid, {
      [accessToken]: 'owner'
    })
    return true
  }

  return docPermissions[accessToken] === (permission || 'owner')
}

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
      const secure = ({ permission } = {}) => {
        if (!authenticate(conn.docName, json.auth)) {
          conn.send('access-denied')
        }
      }

      switch (json.type) {
        case 'auth':
          // noop endpoint
          // handled in authenticate
          break
        case 'share':
          if (!secure()) return
          console.log('share success')
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

server.listen(port, host, () => {
  console.log(`running at '${host}' on port ${port}`)
})
