'use strict';

const { EventEmitter } = require('events');

const jobEmitter = new EventEmitter();
jobEmitter.setMaxListeners(100);

module.exports = { jobEmitter };
