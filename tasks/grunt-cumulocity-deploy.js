var _ = require('lodash');

module.exports = function (grunt) {
  'use strict';
  
  var configKey = 'c8yDeployUI';
  
  function getConfig() {
    return grunt.config(configKey) || {};
  }
  
  function setConfig(config) {
    grunt.config.set(configKey, config);
  }
  
  function getTargetCfgPath() {
    return './deploy/configs/' + (grunt.option('environment') || 'cumulocity') + '.json';
  }
  
  function getAllApps() {
    var currentApp = grunt.config('currentlocalapp'),
      apps = grunt.config('localapps'),
      allApps = [].concat(apps).concat([currentApp]);
    return allApps;
  }
  
  function getAllPlugins() {
    return grunt.config('localplugins');
  }
  
  function getAppForCfg(appCfg, targetCfg, allApps, allPlugins) {
    var app = {manifest: null, plugins: []},
      manifest = _.clone(_.find(allApps, function (a) {
        return a.contextPath === appCfg.contextPath;
      }));

    if (manifest) {
      manifest = cleanAppManifest(manifest, appCfg, targetCfg);
      grunt.log.ok('Packed application: ' + appCfg.contextPath);
      _.each(allPlugins, function (plgManifest) {
        if (plgManifest.__rootContextPath.match('^' + appCfg.contextPath + '/')) {
          var pluginManifest = _.clone(plgManifest);
          pluginManifest = cleanPluginManifest(pluginManifest, appCfg, targetCfg);
          app.plugins.push(pluginManifest);
          grunt.log.ok('Packed plugin: ' + appCfg.contextPath + '/' + pluginManifest.contextPath);
        }
      });
      app.manifest = manifest;
      return app;
    } else {
      grunt.fail.fatal('Cannot find manifest for target app: ' + appCfg.contextPath);
    }
  }
  
  function cleanAppManifest(manifest, appCfg, targetCfg) {
    if (targetCfg && targetCfg.manifests && targetCfg.manifests.apps) {
      manifest = _.merge(manifest, targetCfg.manifests.apps);
    }
    if (appCfg.branch) {
      manifest.resourcesUrl = manifest.resourcesUrl.replace(/raw\/[^\/]+/, 'raw/' + appCfg.branch);
    }
    _.each(manifest, function (val,  key) {
      if (key.match('^__')) {
        delete manifest[key];
      }
    });
    return manifest;
  }
  
  function cleanPluginManifest(manifest, appCfg, targetCfg) {
    if (targetCfg && targetCfg.manifests && targetCfg.manifests.plugins) {
      manifest = _.merge(manifest, targetCfg.manifests.plugins);
    }
    _.each(manifest, function (val,  key) {
      if (key.match('^__')) {
        delete manifest[key];
      }
    });
    return manifest;
  }
  
  function getManifestsPackWritePath(targetCfg) {
    return './deploy/manifests/' + targetCfg.name + '_' + targetCfg.version + '.json';
  }
  
  function getManifestsPackLoadPath(targetCfg) {
    return grunt.option('manifests') || 'manifests.json';
  }
  
  grunt.registerTask('c8yDeployUI:packManifests', 'Exports manifests to manifests pack', [
    'readManifests',
    'c8yDeployUI:loadTargetConfig',
    'c8yDeployUI:prepareManifestsPack',
    'c8yDeployUI:writeManifestsPack'
  ]);
  
  grunt.registerTask('c8yDeployUI:loadTargetConfig', 'Loads target config for deployment', function () {
    var config = getConfig(),
      path = getTargetCfgPath();

    if (grunt.file.exists(path)) {
      config.targetCfg = grunt.file.readJSON(path);
      grunt.log.ok('Loaded target config from ' + path + '.');
    } else {
      grunt.fail.fatal('Cannot find target config in ' + path + '!');
    }
    
    setConfig(config);
  });
  
  grunt.registerTask('c8yDeployUI:prepareManifestsPack', 'Prepares manifests pack to write', function () {
    var config = getConfig(),
      allApps = getAllApps(),
      allPlugins = getAllPlugins(),
      manifestsPack = {apps: []};
      
    _.each(config.targetCfg.applications, function (appCfg) {
      var app = getAppForCfg(appCfg, config.targetCfg, allApps, allPlugins);
      manifestsPack.apps.push(app);
    });

    config.manifestsPack = manifestsPack;
    setConfig(config);
  });
  
  grunt.registerTask('c8yDeployUI:writeManifestsPack', 'Writes manifests pack to file', function () {
    var config = getConfig(),
      path = getManifestsPackWritePath(config.targetCfg);
    
    grunt.file.write(path, JSON.stringify(config.manifestsPack));
    grunt.log.ok('Manifests pack saved to ' + path + '.');
  });

  grunt.registerTask('c8yDeployUI:registerManifests', 'Registers manifests from provided file', [
    'c8yDeployUI:loadManifestsPack',
    'c8yDeployUI:registerManifestsPack'
  ]);
  
  grunt.registerTask('c8yDeployUI:loadManifestsPack', 'Loads manifests pack from file', function () {
    var config = getConfig(),
      path = getManifestsPackLoadPath();

    if (grunt.file.exists(path)) {
      config.manifestsPack = grunt.file.readJSON(path);
      grunt.log.ok('Loaded manifests pack from ' + path + '.');
    } else {
      grunt.fail.fatal('Cannot find manifests pack in ' + path + '!');
    }
    
    setConfig(config);
  });
  
  grunt.registerTask('c8yDeployUI:registerManifestsPack', 'Registers manifests from pack', function () {
    var config = getConfig(),
      apps = config.manifestsPack.apps;
      
    _.each(apps, function (app) {
      var appManifest = app.manifest;
      grunt.task.run('c8yDeployUI:appRegister:' + appManifest.contextPath + ':noImports');
      _.each(app.plugins, function (plugin) {
        grunt.task.run('c8yDeployUI:pluginRegister:' + appManifest.contextPath + ':' + plugin.contextPath + ':noImports');
      });
    });
    
    _.each(apps, function (app) {
      var appManifest = app.manifest;
      _.each(app.plugins, function (plugin) {
        grunt.task.run('c8yDeployUI:pluginRegister:' + appManifest.contextPath + ':' + plugin.contextPath);
      });
      grunt.task.run('c8yDeployUI:appRegister:' + appManifest.contextPath);
    });
  });
  
  grunt.registerTask('c8yDeployUI:appRegister', 'Register app from manifests pack', function (appContextPath, option) {
    var config = getConfig(),
      app = _.find(config.manifestsPack.apps, function (a) {
        return a.manifest.contextPath === appContextPath;
      }),
      appManifest = app.manifest;
      
    if (option === 'noImports') {
      app.imports = [];
    }
    
    grunt.config.set('c8yAppRegister', {app: appManifest});
    grunt.task.run('c8yAppRegister');
  });
  
  grunt.registerTask('c8yDeployUI:pluginRegister', 'Register plugin from manifests pack', function (appContextPath, pluginContextPath, option) {
    var config = getConfig(),
      app = _.find(config.manifestsPack.apps, function (a) {
        return a.manifest.contextPath === appContextPath;
      }),
      appManifest = app.manifest,
      pluginManifest = _.find(app.plugins, function (p) {
        return p.contextPath === pluginContextPath;
      });
      
    pluginManifest.directoryName = pluginManifest.contextPath;
      
    if (option === 'noImports') {
      pluginManifest.imports = [];
    }
    
    grunt.config.set('c8yPluginRegister', {app: appManifest, plugin: pluginManifest});
    grunt.task.run('c8yPluginRegister');
  });
};