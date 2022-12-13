#!/usr/bin/env node

/**
 * @type {any}
 */
const WebSocket = require('ws')
const http = require('http')
const wss = new WebSocket.Server({ noServer: true })
const setupWSConnection = require('./utils.js').setupWSConnection

const host = process.env.HOST || 'localhost'
const port = process.env.PORT || 1234

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain' })
  response.end('okay')
})

const permissions = {}

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
    if (!permissions[conn.docName]) {
      permissions[conn.docName] = message
    }
    conn.authenticated = permissions[conn.docName] === message
    if (conn.authenticated) {
      console.log('authenticated:', message)
      conn.send('authenticated')
      setupWSConnection(conn, conn.req, { docName: conn.docName, gc: conn.gc })
    } else {
      console.log('access denied:', message)
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
