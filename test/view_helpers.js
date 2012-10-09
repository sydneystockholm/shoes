var assert = require('assert')
  , helpers = require('../lib/view_helpers');

describe('View Helpers', function () {
    it('should fix title widows', function (done) {
        assert.equal('foo bar&nbsp;hello', helpers.widow('foo bar hello'));
        assert.equal('foo&nbsp;bar', helpers.widow('foo bar'));
        done();
    });
    it('should append to the query string', function (done) {
        assert.equal('/foo?limit=10&page=2', helpers.query('/foo?limit=10', { page: 2 }));
        done();
    });
    it('should format numbers', function (done) {
        assert.equal(helpers.number_format(1000), '1,000');
        assert.equal(helpers.number_format(12000), '12,000');
        assert.equal(helpers.number_format(123000), '123,000');
        assert.equal(helpers.number_format(1234000), '1,234,000');
        assert.equal(helpers.number_format('1234000'), '1,234,000');
        assert.equal(helpers.number_format(null), '0');
        assert.equal(helpers.number_format(), '0');
        done();
    });
    it('should create slugs correctly', function (done) {
        assert.equal('foo', helpers.slug('foo'));
        assert.equal('foo-bar', helpers.slug('foo      bar'));
        assert.equal('foo-bar', helpers.slug('foo      bar.'));
        assert.equal('87-foo', helpers.slug(' ~87   foo  !!!  '))
        done();
    });
});

