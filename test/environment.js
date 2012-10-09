var assert = require('assert')
  , Environment = require('../').Environment
  , env = new Environment();

describe('Environment', function () {
    it('should fail if the config file can\'t be found', function (done) {
        assert.throws(function () {
            env.loadConfig('badconfig.json');
        });
        done();
    });
    it('should fail if the file contains invalid json', function (done) {
        assert.throws(function () {
            env.loadConfig(__dirname + '/data/invalid.json');
        });
        done();
    });
    it('should load the "default" namespace if no environment is specified', function (done) {
        var c = env.loadConfig(__dirname + '/data/default.json');
        assert.equal('bar', c.foo);
        done();
    });
    it('should load environment config', function (done) {
        var c = new Environment('dev').loadConfig(__dirname + '/data/env.json');
        assert.equal('bar', c.foo);
        done();
    });
    it('should merge default config', function (done) {
        var c = new Environment('dev').loadConfig(__dirname + '/data/env2.json');
        assert.equal('a', c.a);
        assert.equal('b', c.b);
        assert.equal('c', c.c);
        done();
    });
    it('should recursively merge objects', function (done) {
        var c = new Environment('dev').loadConfig(__dirname + '/data/env2.json', 'dev');
        assert.equal('a', c.obj.a);
        assert.equal('b', c.obj.b);
        assert.equal('c', c.obj.c);
        done();
    });
    it('should support calling a single exported function', function (done) {
        var obj = env.callModules(__dirname + '/data/modules', 'lol');
        assert.equal(obj.foo, 'foolol');
        assert.equal(obj.bar, 'barlol');
        done();
    });
});

