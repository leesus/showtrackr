var express = require('express');
var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var compress = require('compression');
var mongoose = require('mongoose');
var async = require('async');
var request = require('request');
var xml2js = require('xml2js');
var _ = require('lodash');
var session = require('express-session');
var passport = require('passport');
var LocalStrategy = require('passport-local');
var agenda = require('agenda')({ db: { address: 'mongodb://leesus:5h0wtr4ckr@ds031968.mongolab.com:31968/showtrackr' } });
var sugar = require('sugar');
var nodemailer = require('nodemailer');
// Models
var Show = require('./models/show');
var User = require('./models/user');

mongoose.connect('mongodb://leesus:5h0wtr4ckr@ds031968.mongolab.com:31968/showtrackr');

var app = express();

// setup passport
passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

passport.use(new LocalStrategy({ usernameField: 'email' }, function(email, password, done) {
  User.findOne({ email: email }, function(err, user) {
    if (err) return done(err);
    if (!user) return done(null, false);
    user.comparePassword(password, function(err, isMatch) {
      if (err) return done(err);
      if (isMatch) return done(null, user);
      return done(null, false);
    });
  });
}));

// agenda tasks
agenda.define('send email alert', function(job, done) {
  Show.findOne({ name: job.attrs.data }).populate('subscribers').exec(function(err, show){
    var emails = show.subscribers.map(function(user) {
      return user.email;
    });

    var upcomingEpisode = show.episodes.filter(function(show) {
      return new Date(episode.firstAired) > new Date();
    })[0];

    var smtpTransport = nodemailer.createTransport('SMTP', {
      service: 'SendGrid',
      auth: { user: 'hslogin', pass: 'hspassword00' }
    });

    var mailOptions = {
      from: 'ShowTrackr <info@showtrackr.com>',
      to: emails.join(''),
      subject: show.name + ' is starting soon!',
      text: show.name + ' starts in less than 2 hours on ' + show.network + '.\n\n' +
        'Episode ' + upcomingEpisode.episodeNumber + ' Overview\n\n' + upcomingEpisode.overview
    };

    smtpTransport.sendMail(mailOptions, function(err, res) {
      console.log('Message sent: ' + res.message);
      smtpTransport.close();
      done();
    });
  });
});

agenda.start();

agenda.on('start', function(job) {
  console.log('Job %s starting', job.attrs.name);
});

agenda.on('complete', function(job) {
  console.log('Job %s finished', job.attrs.name);
});

// all environments
app.set('port', process.env.PORT || 3000);
app.engine('html', require('ejs').renderFile);
app.set('views', path.join(__dirname, 'public'));
app.use(compress());
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use(session({ secret: 'keyboard cat' }));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 86400000 }));

app.locals({
  environment: app.get('env')
});

// auth middleware
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) next();
  else res.send(401);
}

app.use(function(req, res, next) {
  if (req.user) {
    res.cookie('user', JSON.stringify(req.user));
  }
  next();
});

app.get('/', function(req, res) {
  res.render('index.ejs');
});

// api routes
app.post('/api/login', passport.authenticate('local'), function(req, res) {
  res.cookie('user', JSON.stringify(req.user));
  res.send(req.user);
});

app.post('/api/signup', function(req, res, next) {
  var user = new User({
    email: req.body.email, 
    password: req.body.password
  });
  user.save(function(err) {
    if (err) return next(err);
    res.send(200);
  });
});

app.get('/api/logout', function(req, res, next) {
  req.logout();
  res.send(200);
});

app.post('/api/subscribe', ensureAuthenticated, function(req, res, next) {
  Show.findById(req.body.showId, function(err, show) {
    if (err) return next(err);
    show.subscribers.push(req.body.userId);
    show.save(function(err) {
      if (err) return next(err);
      res.send(200);
    });
  });
});

app.post('/api/unsubscribe', ensureAuthenticated, function(req, res, next) {
  Show.findById(req.body.showId, function(err, show) {
    if (err) return next(err);
    var index = show.subscribers.indexOf(show);
    show.subscribers.splice(index, 1);
    show.save(function(err) {
      if (err) return next(err);
      res.send(200);
    });
  });
});

app.get('/api/shows', function(req, res, next){
  var query = Show.find();
  if (req.query.genre) {
    query.where({ genre: req.query.genre });
  } else if (req.query.alphabet) {
    query.where({ name: new RegExp('^' + '[' + req.query.alphabet + ']', 'i') });
  } else {
    query.limit(12);
  }
  query.exec(function(err, shows){
    if (err) return next(err);
    res.send(shows);
  });
});

app.post('/api/shows', function(req, res, next){
  var APIKEY = '9EF1D1E7D28FDA0B';
  var parser = xml2js.Parser({
    explicitArray: false,
    normalizeTags: true
  });
  var seriesName = req.body.showName
    .toLowerCase()
    .replace(/ /g, '_')
    .replace(/[^\w-]+/g, '');

  async.waterfall([
    // Get the show id
    function(callback) {
      request.get('http://thetvdb.com/api/GetSeries.php?seriesname=' + seriesName, function(error, response, body) {
        if (error) return next(error);
        parser.parseString(body, function(err, result) {
          var seriesId = result.data.series.seriesid || result.data.series[0].seriesid;
          callback(err, seriesId);
        });
      });
    },
    // Get the show info
    function(seriesId, callback) {
      request.get('http://thetvdb.com/api/' + APIKEY + '/series/' + seriesId + '/all/en.xml', function(error, response, body) {
        if (error) return next(error);
        parser.parseString(body, function(err, result) {
          var series = result.data.series;
          var episodes = result.data.episode;
          var show = new Show({
            _id: series.id,
            name: series.seriesname,
            airsDayOfWeek: series.airs_dayofweek,
            airsTime: series.airs_time,
            firstAired: series.firstaired,
            genre: series.genre.split('|').filter(Boolean),
            network: series.network,
            overview: series.overview,
            rating: series.rating,
            ratingCount: series.ratingcount,
            runtime: series.runtime,
            status: series.status,
            poster: series.poster,
            episodes: []
          });
          _.each(episodes, function(episode) {
            show.episodes.push({
              season: episode.seasonnumber,
              episodeNumber: episode.episodenumber,
              episodeName: episode.episodename,
              firstAired: episode.firstaired,
              overview: episode.overview
            });
          });
          callback(err, show);
        });
      });
    },
    // Convert image to base64
    function(show, callback) {
      var url = 'http://thetvdb.com/banners/' + show.poster;
      request({ url: url, encoding: null }, function(error, response, body) {
        show.poster = 'data:' + response.headers['content-type'] + ';base64,' + body.toString('base64');
        callback(error, show);
      });
    },
    // Save the show    
  ], function(err, show) {
    if (err) return next(err);
    show.save(function(err) {
      if (err) {
        if (err.code == 11000) {
          return res.send(409, { message: show.name + ' already exists.' });
        }
        return next(err);
      }

      var alertDate = Date.create('Next ' + show.airsDayOfWeek + ' at ' + show.airsTime).rewind({ hour: 2 });
      agenda.schedule(alertDate, 'send email alert', show.name).repeatEvery('1 week');

      res.send(200);
    });
  });
});

app.get('/api/shows/:id', function(req, res, next){
  Show.findById(req.params.id, function(err, show){
    if (err) return next(err);
    res.send(show);
  });
});

// redirect route for pushState
app.get('*', function(req, res){
  res.redirect('/#' + req.originalUrl);
});

// error handler
app.use(function(err, req, res, next) {
  console.error(err.stack);
  res.send(500, { message: err.message });
});

app.listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});
