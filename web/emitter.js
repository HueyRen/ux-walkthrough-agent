'use strict';

const { EventEmitter } = require('events');

const jobEmitter = new EventEmitter();
jobEmitter.setMaxListeners(50);

module.exports = { jobEmitter };
