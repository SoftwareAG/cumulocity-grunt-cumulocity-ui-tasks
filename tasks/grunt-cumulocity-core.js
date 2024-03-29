var _ = require('lodash'),
  path = require('path');

function task(grunt) {

  var CORE_CONFIG_FILE = 'core.config.json',
    CORE_FOLDER = 'cumulocity-ui',
    PATH_OBJ = getCorePath(),
    APP_FOLDER = 'app/';

  function getCorePath() {
    var coreConfigFile = CORE_CONFIG_FILE,
      coreFolder = CORE_FOLDER,
      isCore = grunt.file.exists(coreConfigFile),
      hasCoreSibling = !isCore && grunt.file.exists('..', coreFolder, coreConfigFile),
      filePath = isCore ? coreConfigFile :
        (hasCoreSibling ? path.join('..', coreFolder, coreConfigFile) : null);

    return {
      path: filePath,
      isCore: isCore,
      hasCoreSibling: hasCoreSibling
    };
  }

  function getCoreConfig() {
    var path_data = PATH_OBJ;
      config = path_data.path ? grunt.file.readJSON(path_data.path) : null;
    return config;
  }

  function filterType(arr, type) {
    return _.chain(arr)
      .map(function (f) {
        return f[type] || ((type === 'local') ? f : null);
      })
      .filter(_.identity)
      .map(function (f) {
        if (f.match(/^scripts/) || f.match(/^bower_components/)) {
          f = APP_FOLDER + f;
        }

        if (PATH_OBJ.hasCoreSibling) {
          f = '../' + CORE_FOLDER + '/' + f;
        }
        return f;
      })
      .value();
  }


  grunt.task.registerTask('core-config', function () {
    var config = grunt.config('coreconfig');

    if (!config) {
      config = {};
      var rawcfg = config.raw = getCoreConfig();

      if (rawcfg) {
        config = _.extend(config, {
          cssvendor: function () {
            return filterType(this.raw.cssfiles.vendor, 'local');
          },

          cssui: function () {
            return filterType(this.raw.cssfiles.ui, 'local');
          },

          css: function () {
            return _.union(this.cssvendor(), this.cssui());
          },

          jsvendor: function () {
            return filterType(this.raw.jsfiles.vendor, 'local');
          },

          jscore: function () {
            return filterType(this.raw.jsfiles.core, 'local');
          },

          jsui: function () {
            return filterType(this.raw.jsfiles.ui, 'local');
          },

          js: function () {
            return _.union(this.jsvendor(), this.jscore(), this.jsui());
          },

          jsForHtml: function () {
            return _.union(_.map(this.js(), function (f) {
              return f.replace(APP_FOLDER, '/apps/core/');
            }), ['/apps/core/scripts/start.js']);
          },

          jsForHtmlBuild: function () {
            var JSDELIVR = '//cdn.jsdelivr.net/g/',
              jsPath = _.chain(this.raw.jsfiles.vendor)
                .filter('jsdelivr')
                .pluck('jsdelivr')
                .groupBy('project')
                .reduce(function (path, files, project) {
                  if (path !== JSDELIVR) {
                    path = path + ',';
                  }
                  path = path + project + '(' + _.pluck(files, 'file').join('+') + ')';
                  return path;
                }, JSDELIVR)
                .value();

            return [jsPath, '/apps/core/scripts/main.js'];
          },

          cssForHtml: function () {
            return _.map(this.css(), function (f) {
              if (f.match(/^style/)) {
                return '/apps/core/' + f;
              }
              return f.replace(APP_FOLDER, '/apps/core/');
            });
          },

          cssForHtmlBuild: function () {
            var cssVendor = _.chain(this.raw.cssfiles.vendor)
              .filter('remote')
              .pluck('remote')
              .value();
            return _.union(cssVendor, ['/apps/core/styles/main.css']);
          },

          jstest: function () {
            return _.union(this.jsvendor(), this.jscore(), this.jsui(),
                filterType(this.raw.jsfiles.vendortest, 'local'),
                filterType(this.raw.jsfiles.test, 'local'));
          }

        });

        config._jstest = config.jstest();
      }

      grunt.config('coreconfig', config);
    }

  });

  grunt.registerTask('prepareTest', function () {
    var corePath = getCorePath(),
      coreconfig = grunt.config('coreconfig'),
      pluginsFiles = [],
      pluginManifestsGlob = (corePath.isCore ? 'app/' : '') + 'plugins/**/cumulocity.json',
      jsPath = function (path, f) {
        var isBower = f.match('bower_components'),
          isCore = corePath.isCore,
          bowerPath = (isCore ? 'app/' : '') + f,
          pluginPath = path + f,
          _f = isBower ? bowerPath : pluginPath;
        pluginsFiles.push(_f);
      };

    grunt.file.expand(pluginManifestsGlob).forEach(function (path) {
      var manifest = grunt.file.readJSON(path),
        _path = path.replace('cumulocity.json', '');

      if (manifest.js) {
        manifest.js.forEach(_.partial(jsPath, _path));
      }
    });
    var isIndex = function (f) { return f.match('index.js'); };
    var indexFiles = _.filter(pluginsFiles, isIndex);
    _.forEach(indexFiles, function (f) {
      var _f = f.replace('index', 'index.mock');
      if (grunt.file.exists(_f)) {
        var ix = pluginsFiles.indexOf(f);
        pluginsFiles.splice(ix, 1, _f);
      }
    });

    var files = _.sortBy(pluginsFiles, function (f) {
      return (f.match(/index(\.mock)?.js/) ? 0 : 1);
    });

    var karmaCfg = grunt.config('karma'),
      specFiles = grunt.config('specFiles');

    karmaCfg.test.options.files = [].concat(coreconfig._jstest)
      .concat(files).concat(specFiles || []);
    grunt.config('karma', karmaCfg);
  });
}

module.exports = task;