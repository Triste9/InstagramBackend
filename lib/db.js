'use strict'

const r = require('rethinkdb')
const co = require('co')
const Promise = require('bluebird')
const utils = require('./utils')
const uuid = require('uuid-base62')

const defaults = {
  host: 'localhost',
  port: 28015,
  db: 'platzigram'

}
class Db {
  constructor (options) {
    options = options || {}
    this.host = options.host || defaults.host
    this.port = options.port || defaults.port
    this.db = options.db || defaults.db
  }
  connect (callback) {
    this.connection = r.connect({
      host: this.host,
      port: this.port
    })
    this.connected = true

    let db = this.db
    let connection = this.connection

    let setup = co.wrap(function * () {
      let conn = yield connection
      let dbList = yield r.dbList().run(conn)
      if (dbList.indexOf(db) === -1) {
        yield r.dbCreate(db).run(conn)
      }
      let dbTable = yield r.db(db).tableList().run(conn)
      if (dbTable.indexOf('images') === -1) {
        yield r.db(db).tableCreate('images').run(conn)
        yield r.db(db).table('images').indexCreate('createdAt').run(conn)
      }
      if (dbTable.indexOf('users') === -1) {
        yield r.db(db).tableCreate('users').run(conn)
        yield r.db(db).table('users').indexCreate('username').run(conn)
      }

      return conn
    })
    return Promise.resolve(setup()).asCallback(callback)
  }

  disconnect (callback) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected')).asCallback(callback)
    }
    this.connected = false
    return Promise.resolve(this.connection)
    .then((conn) => conn.close())
  }
  saveImage (imagen, callback) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db
    let task = co.wrap(function * () {
      let conn = yield connection
      imagen.createAt = new Date()
      imagen.tags = utils.extractTrags(imagen.description)
      let result = yield r.db(db).table('images').insert(imagen).run(conn)
      if (result.errors > 0) {
        return Promise.reject(new Error(result.first_error))
      }
      imagen.id = result.generated_keys[0]

      yield r.db(db).table('images').get(imagen.id).update({
        public_id: uuid.encode(imagen.id)
      }).run(conn)
      let created = yield r.db(db).table('images').get(imagen.id).run(conn)

      return Promise.resolve(created)
    })
    return Promise.resolve(task()).asCallback(callback)
  }

  likeImage (id, callback) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db
    let imageId = uuid.decode(id)
    let task = co.wrap(function * () {
      let conn = yield connection
      let image = yield r.db(db).table('images').get(imageId).run(conn)
      yield r.db(db).table('images').get(imageId).update({
        liked: true,
        likes: image.likes + 1
      }).run(conn)
      let created = yield r.db(db).table('images').get(imageId).run(conn)
      return Promise.resolve(created).asCallback(callback)
    })
    return Promise.resolve(task()).asCallback(callback)
  }
  getimage (id, callback) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db
    let imageId = uuid.decode(id)
    let task = co.wrap(function * () {
      let conn = yield connection
      let image = yield r.db(db).table('images').get(imageId).run(conn)
      return Promise.resolve(image).asCallback(callback)
    })
    return Promise.resolve(task()).asCallback(callback)
  }
  getImages (callback) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db

    let tasks = co.wrap(function * () {
      let conn = yield connection

      let images = yield r.db(db).table('images').orderBy(r.desc('createdAt')).run(conn)
      let result = yield images.toArray()

      return Promise.resolve(result)
    })

    return Promise.resolve(tasks()).asCallback(callback)
  }
  saveUser (user, callback) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db

    let tasks = co.wrap(function * () {
      let conn = yield connection
      user.password = utils.encrypt(user.password)
      user.createAt = new Date()
      let result = yield r.db(db).table('users').insert(user).run(conn)
      if (result.errors > 0) {
        return Promise.reject(new Error(result.first_error))
      }
      user.id = result.generated_keys[0]
      let created = yield r.db(db).table('users').get(user.id).run(conn)
      return Promise.resolve(created)
    })
    return Promise.resolve(tasks()).asCallback(callback)
  }
  getUser (username, callback) {
    if (!this.connected) {
      return Promise.reject(new Error('not connected')).asCallback(callback)
    }

    let connection = this.connection
    let db = this.db

    let tasks = co.wrap(function * () {
      let conn = yield connection
      yield r.db(db).table('users').indexWait().run(conn)
      let users = yield r.db(db).table('users').getAll(username, {
        index: 'username'
      }).run(conn)
      let result = yield users.next()
      return Promise.resolve(result)
    })
    return Promise.resolve(tasks()).asCallback(callback)
  }
}
module.exports = Db