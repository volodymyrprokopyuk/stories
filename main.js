var fs = require('fs');
var _ = require('lodash');
var when = require('when');
var pipeline = require('when/pipeline');
var sequence = require('when/sequence');
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

var mkdir = node.lift(mkdirp);
var readFile = node.lift(fs.readFile);
var writeFile = node.lift(fs.writeFile);
exec = node.lift(exec);

var get = function(url) {
  return when.promise(function(resolve, reject) {
    request(url, function(error, response, body) {
      error ? reject(error) : resolve(body);
    });
  });
};

var selectParts = function(body) {
  var $ = cheerio.load(body);
  return _.map($('main section li a'), function(dom) {
    return config.url + $(dom).attr('href');
  });
};

var getPart = function(parts) {
  console.log('Getting part `%s`...', config.part);
  var url = _.find(parts, function(part) {
    return new RegExp(config.part, 'i').test(part);
  });
  return url ? get(url) : when.reject('no part with name ' + name);
};

var selectSections = function(body) {
  var $ = cheerio.load(body);
  return _.map($('main section li a'), function(dom) {
    return config.url + $(dom).attr('href');
  });
};

var getSections = function(sections) {
  console.log('  %s stories', sections.length);
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
  var json = JSON.stringify(stories, null, 2);
  var makeJSONDir = _.partial(mkdir, 'json');
  var writeJSONFile = _.partial(writeFile, 'json/' + config.part + '.json'
    , json);
  return pipeline([ makeJSONDir, writeJSONFile, function() {
    return '  save stories: done';
  } ]);
};

var readStories = function(file) {
  console.log('Reading file `%s`...', file);
  var readJSONFile = _.partial(readFile, 'json/' + file + '.json', 'utf8');
  return pipeline([ readJSONFile, JSON.parse ]);
};

var splitStories = function(stories) {
  console.log('  %s stories', stories.length);
  var storyCount = 0;
  return _.reduce(stories.slice(0, 6), function(volumes, story) {
    var volume = Math.floor(storyCount++/config.storiesPerVolume) + 1;
    volumes[volume] = volumes[volume] || [ ];
    volumes[volume].push(story);
    return volumes;
  }, { });
};

var renderTeX = function(volume) {
  var readTemplate = _.partial(readFile, 'tex/stories.handlebars', 'utf8');
  var renderTemplate = function(template) {
    var render = hb.compile(template);
    var tex = render({ volume: volume.volume, stories: volume.stories
      , part: config.part });
    return { volume: volume.volume, tex: tex };
  };
  return pipeline([ readTemplate, renderTemplate ]);
};

var saveTeX = function(tex) {
  var makePDFDir = _.partial(mkdir, 'pdf');
  var writeTeXFile = _.partial(writeFile, [ 'pdf/', config.part
    , '-', tex.volume, '.tex' ].join(''), tex.tex);
  return pipeline([ makePDFDir, writeTeXFile, function() {
    return tex.volume;
  } ]);
};

var generatePDF = function(volume) {
  var luatex = _.partial(exec, [ 'lualatex --halt-on-error ', config.part
    , '-', volume, '.tex' ].join(''), { cwd: 'pdf' });
  return pipeline([ luatex, function() {
    console.log('  generating volume `%s`: done', volume);
  } ]);
};

var generatePDFs = function(volumes) {
  var task = [ renderTeX, saveTeX , generatePDF ];
  var tasks = _.map(volumes, function(stories, volume) {
    return _.partial(pipeline, task, { volume: volume, stories: stories });
  });
  return sequence(tasks);
};

var scrap = [ get, selectParts, getPart, selectSections, getSections
  , selectStories, saveStories ];
var pdf = [ readStories, splitStories, generatePDFs, function() {
  return 'generating PDFs: done';
} ];

//pipeline(scrap, config.url)
pipeline(pdf, config.part)
  .then(console.log)
  .otherwise(console.error);
