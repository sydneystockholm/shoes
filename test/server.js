var assert = require('assert')
  , fs = require('fs')
  , path = require('path')
  , Server = require('../').Server
  , request = require('request')
  , next_port = 10001
  , servers = {};

function create(dir, config, with_server) {
    var server = new Server(__dirname + '/data/' + dir, config);
    if (with_server) {
        with_server(server);
    }
    var app = server.create()
      , port = next_port++
      , url = 'http://localhost:' + port + '/';
    app.server = server.listen(port);
    servers[url] = server.app;
    return url;
}

function close(url) {
    var app = get(url);
    app.server.close();
    delete servers[url];
}

function get(url) {
    if (!(url in servers)) {
        throw new Error(url + ' not found');
    }
    return servers[url];
}

describe('Server', function () {
    it('should render nunjucks templates', function (done) {
        var url = create('srv1')
          , app = get(url);
        app.get('/', function (request, response) {
            response.render('index', { data: ['a', 'b', 'c'] });
        });
        request(url, function (err, res, body) {
            assert(!err, err);
            assert.equal('abc\n', body);
            close(url);
            done();
        });
    });
    it('should compile less css', function (done) {
        var url = create('srv2')
          , app = get(url);
        fs.unlink(__dirname + '/data/srv2/compiled/css/style.css', function () {
            request(url + 'css/style.css', function (err, res, body) {
                assert(!err, err);
                assert.equal(body, 'p {\n  color: blue;\n}\nbody {\n  color: red;\n}\n');
                request(url + 'css/' + app.nonce + '/style.css', function (err, res, body) {
                    assert(!err, err);
                    assert.equal(body, 'p {\n  color: blue;\n}\nbody {\n  color: red;\n}\n');
                    (fs.exists || path.exists)(__dirname + '/data/srv2/compiled/css/style.css', function (exists) {
                        assert(exists);
                        request(url + 'css/123987/style.css', function (err, res) {
                            assert(!err, err);
                            assert.equal(res.statusCode, 404);
                            close(url);
                            done();
                        });
                    });
                });
            });
        });
    });
    it('should minify css in production', function (done) {
        var url = create('srv3', { production: true });
        fs.unlink(__dirname + '/data/srv3/compiled/css/style.css', function () {
            request(url + 'css/style.css', function (err, res, body) {
                assert(!err, err);
                assert.equal(body, 'p{color:#00f}body{color:#f00}');
                close(url);
                (fs.exists || path.exists)(__dirname + '/data/srv3/compiled/css/style.css', function (exists) {
                    assert(exists);
                    done();
                });
            });
        });
    });
    it('should compile js', function (done) {
        var url = create('srv4')
          , app = get(url);
        fs.unlink(__dirname + '/data/srv4/compiled/js/script.js', function () {
            request(url + 'js/script.js', function (err, res, body) {
                assert(!err, err);
                assert.equal(body, 'var foo = 2 + 2;\n');
                request(url + 'js/' + app.nonce + '/script.js', function (err, res, body) {
                    assert(!err, err);
                    assert.equal(body, 'var foo = 2 + 2;\n');
                    close(url);
                    (fs.exists || path.exists)(__dirname + '/data/srv4/compiled/js/script.js', function (exists) {
                        assert(exists);
                        done();
                    });
                });
            });
        });
    });
    it('should minify js in production', function (done) {
        var url = create('srv5', { production: true });
        fs.unlink(__dirname + '/data/srv5/compiled/js/script.js', function () {
            request(url + 'js/script.js', function (err, res, body) {
                assert(!err, err);
                assert.equal(body, 'var foo=4;');
                close(url);
                (fs.exists || path.exists)(__dirname + '/data/srv5/compiled/js/script.js', function (exists) {
                    assert(exists);
                    done();
                });
            });
        });
    });
    it('should give views access to helpers', function (done) {
        var url = create('srv6')
          , app = get(url);
        app.get('/', function (request, response) {
            response.render('index', { title: ' HEY THERE!' });
        });
        request(url, function (err, res, body) {
            assert(!err, err);
            assert.equal('hey-there\n', body);
            close(url);
            done();
        });
    });
    it('should gracefully handle bad js', function (done) {
        var url = create('srv7', { minify: true, production: true });
        request(url + 'js/script.js', function (err, res) {
            assert(!err, err);
            assert.equal(500, res.statusCode);
            close(url);
            done();
        });
    });
    it('should catch less compiler errors', function (done) {
        var url = create('srv8', { production: true });
        fs.unlink(__dirname + '/data/srv8/compiled/css/style.css', function () {
            request(url + 'css/style.css', function (err, res) {
                assert(!err, err);
                assert.equal(500, res.statusCode);
                close(url);
                done();
            });
        });
    });
    it('should render 404 views', function (done) {
        var url = create('srv9', null, function (server) {
            server.notFoundHandler(function (request, response) {
                response.send('not found', 404);
            });
        });
        request(url + 'notarealroute', function (err, res, body) {
            assert(!err, err);
            assert.equal(404, res.statusCode);
            assert.equal('not found', body);
            close(url);
            done();
        });
    });
    it('should render 500 views', function (done) {
        var url = create('srv9', { production: true }, function (server) {
            server.errorHandler(function (msg, stack, request, response) {
                response.send('server error ' + msg, 500);
            });
        });
        get(url).get('/throwplz', function () {
            throw new Error('foo');
        });
        request(url + 'throwplz', function (err, res, body) {
            assert(!err, err);
            assert.equal(500, res.statusCode);
            assert.equal('server error foo', body);
            close(url);
            done();
        });
    });
    it('should hot reload less files', function (done) {
        fs.writeFileSync(__dirname + '/data/srv11/public/css/foo/test.less', 'p { color: blue; }\n');
        var url = create('srv11');
        setTimeout(function () {
            fs.unlink(__dirname + '/data/srv11/compiled/css/style.css', function () {
                request(url + 'css/style.css', function (err, res, body) {
                    assert(!err, err);
                    assert.equal(body, 'p {\n  color: blue;\n}\nbody {\n  color: red;\n}\n');
                    fs.writeFile(__dirname + '/data/srv11/public/css/foo/test.less'
                            , 'p { color: green; }\n', function (err) {
                        assert(!err, err);
                        setTimeout(function () {
                            request(url + 'css/style.css', function (err, res, body) {
                                assert(!err, err);
                                assert.equal(body, 'p {\n  color: green;\n}\nbody {\n  color: red;\n}\n');
                                fs.writeFile(__dirname + '/data/srv11/public/css/foo/test.less'
                                        , 'p { color: blue; }\n', function () {
                                    setTimeout(function () {
                                        request(url + 'css/style.css', function (err, res, body) {
                                            assert(!err, err);
                                            assert.equal(body, 'p {\n  color: blue;\n}\nbody {\n  color: red;\n}\n');
                                            close(url);
                                            done();
                                        });
                                    }, 200);
                                });
                            });
                        }, 200);
                    });
                });
            });
        }, 100);
    });
    it('should hot reload js files', function (done) {
        fs.writeFileSync(__dirname + '/data/srv12/public/js/script.js', 'var foo = 1\n');
        var url = create('srv12');
        setTimeout(function () {
            fs.unlink(__dirname + '/data/srv12/compiled/js/script.js', function () {
                request(url + 'js/script.js', function (err, res, body) {
                    assert(!err, err);
                    assert.equal(body, 'var foo = 1\n');
                    fs.writeFile(__dirname + '/data/srv12/public/js/script.js'
                            , 'var bar = 23\n', function (err) {
                        assert(!err, err);
                        setTimeout(function () {
                            request(url + 'js/script.js', function (err, res, body) {
                                assert(!err, err);
                                assert.equal(body, 'var bar = 23\n');
                                fs.writeFile(__dirname + '/data/srv12/public/js/script.js'
                                        , 'var foo = 1\n', function () {
                                    setTimeout(function () {
                                        request(url + 'js/script.js', function (err, res, body) {
                                            assert(!err, err);
                                            assert.equal(body, 'var foo = 1\n');
                                            close(url);
                                            done();
                                        });
                                    }, 200);
                                });
                            });
                        }, 200);
                    });
                });
            });
        }, 100);
    });
    it('should redirect <=IE8 users to an upgrade page', function (done) {
        var url = create('srv13', null, function (server) {
            server.redirectUseragent(/MSIE [5-8]/, '/upgrade');
        });
        get(url).get('/', function (request, response) {
            response.render('index');
        });
        get(url).get('/upgrade', function (request, response) {
            response.render('ie_upgrade');
        });
        var ua1 = 'Mozilla/5.0 (Windows; U; MSIE 9.0; Windows NT 9.0; en-US)'
          , ua2 = 'Mozilla/4.0 (Windows; MSIE 7.0; Windows NT 5.1; SV1; .NET CLR 2.0.50727)'
          , ua3 = 'Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.1; WOW64; Trident/4.0;)';
        request({ url: url, headers: { 'User-Agent': ua1 }}, function (err, res, body) {
            assert(!err, err);
            assert.equal('hey\n', body);
            request({ url: url, headers: { 'User-Agent': ua2 }}, function (err, res, body) {
                assert(!err, err);
                assert.equal('upgrade plz\n', body);
                request({ url: url, headers: { 'User-Agent': ua3 }}, function (err, res, body) {
                    assert(!err, err);
                    assert.equal('upgrade plz\n', body);
                    request({ url: url, followRedirect: false, headers: { 'User-Agent': ua3 }}, function (err, res) {
                        assert(!err, err);
                        assert.equal(res.headers['x-accel-expires'], 0);
                        close(url);
                        done();
                    });
                });
            });
        });
    });
    it('should send the X-UA-Compatible header', function (done) {
        var url = create('srv13');
        get(url).get('/', function (request, response) {
            response.render('index');
        });
        request({ url: url }, function (err, res) {
            assert(!err, err);
            assert.equal(res.headers['x-ua-compatible'], 'IE=edge,chrome=1');
            close(url);
            done();
        });
    });
    it('should compile less css that imports from a parent directory', function (done) {
        var url = create('srv14', { production: true })
          , app = get(url);
        fs.unlink(__dirname + '/data/srv14/compiled/css/foo/foo.css', function () {
            request(url + 'css/' + app.nonce + '/foo/foo.css', function (err, res, body) {
                assert(!err, err);
                assert.equal(res.statusCode, 200);
                assert.equal(body, 'body{color:#f00}a{color:#008000}');
                close(url);
                done();
            });
        });
    });
});

