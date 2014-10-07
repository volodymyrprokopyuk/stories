var fs = require('fs');
var _ = require('lodash');
var when = require('when');
var pipeline = require('when/pipeline');
var guard = require('when/guard');
var node = require('when/node');
var request = require('request');
var cheerio = require('cheerio');
var mkdirp = require('mkdirp');
var hb = require('handlebars');
var exec = require('child_process').exec;
var config = require('./config');

var Story = function() {
  return {
    title: ''
    , type: ''
    , content: [ ]
  };
};

var get = function(url) {
  return when.promise(function(resolve, reject) {
    request(url, function(error, response, body) {
      error ? reject(error) : resolve(body);
    });
  });
};

var mkdir = node.lift(mkdirp);
var readFile = node.lift(fs.readFile);
var writeFile = node.lift(fs.writeFile);
exec = node.lift(exec);

var selectParts = function(body) {
  var $ = cheerio.load(body);
  return _.map($('main section li a'), function(dom) {
    return [ config.url, $(dom).attr('href') ].join('');
  });
};

var getPart = function(parts) {
  var url = _.find(parts, function(part) {
    return new RegExp(config.part, 'i').test(part);
  });
  return url ? get(url) : when.reject([ 'no part with name', name ].join(' '));
};

var selectSections = function(body) {
  var $ = cheerio.load(body);
  return _.map($('main section li a'), function(dom) {
    return [ config.url, $(dom).attr('href') ].join('');
  });
};

var getSections = function(sections) {
  var gget = guard(guard.n(config.guard), get);
  return when.map(sections/*.slice(0, 6)*/, gget);
};

var selectStories = function(bodies) {
  return _.map(bodies, function(body) {
    var $ = cheerio.load(body);
    var story = Story();
    var context = $('main article');
    story.title = $('h1', context).first().text();
    story.type = $('.type', context).first().text();
    story.content = _.map($('.type', context).nextAll('p'), function(dom) {
      return $(dom).text().replace(/[_]/, '');
    });
    return story;
  });
};

var saveStories = function(stories) {
  return mkdir('json').then(function() {
    return writeFile('json/' + config.part + '.json'
      , JSON.stringify(stories, null, 2));
  });
};

var readStories = function(file) {
  return readFile('json/' + file + '.json', { encoding: 'utf8' }).then(JSON.parse);
};

var renderTeX = function(stories) {
  console.log(stories.length);
  return readFile('tex/stories.handlebars', { encoding: 'utf8' })
    .then(function(template) {
    var render = hb.compile(template);
    return render({ stories: stories, part: config.part });
  });
};

var saveTeX = function(tex) {
  return mkdir('pdf').then(function() {
    return writeFile('pdf/' + config.part + '.tex', tex);
  });
};

var generatePDF = function() {
  return exec([ 'lualatex', '--halt-on-error', config.part + '.tex' ].join(' ')
    , { cwd: 'pdf' });
};

var action = {
  scrap: [ get, selectParts, getPart, selectSections, getSections
    , selectStories, saveStories ]
  , pdf: [ readStories, renderTeX, saveTeX, generatePDF ]
};

//pipeline(action.scrap, config.url)
pipeline(action.pdf, config.part)
  .then(console.log)
  .otherwise(console.error);
