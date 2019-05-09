/**
 * Module dependencies.
 */
const express = require('express');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const favicon = require('serve-favicon');
const session = require('express-session');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const errorhandler = require('errorhandler');
const lusca = require('lusca');
const methodOverride = require('method-override');
const dotenv = require('dotenv');
const path = require('path');
const mongoose = require('mongoose');
const bluebird = require('bluebird');

const MongoStore = require('connect-mongo')(session);

/**
 * Load environment variables from .env file, where API keys and passwords are configured.
 */
dotenv.load();

/**
 * Create Express server.
 */
const app = express();

/**
 * Connect to MongoDB depending on environment
 */
let mongoDatabase = process.env.MONGODB_URI;

if (process.env.NODE_ENV === 'test') {
  mongoDatabase = process.env.MONGODB_TEST;
}

mongoose.connect(mongoDatabase);
mongoose.connection.on('error', () => {
  console.log('MongoDB Connection Error. Please make sure that MongoDB is running.');
  process.exit(1);
});

// Set mongoose promise library to Bluebird
mongoose.Promise = bluebird;

/**
 * Express configuration.
 */
app.use(compression());
app.use(bodyParser.urlencoded({ limit: '1mb', extended: false }));
app.use(bodyParser.json({ limit: '1mb' }));
app.use(methodOverride('_method'));
app.use(cookieParser());
app.use(favicon(path.join(__dirname, '..', 'client', 'favicon.ico')));

let buildFolder;
if (process.env.NODE_ENV === 'production') {
  buildFolder = 'dist';
} else {
  buildFolder = 'client';
}

app.use(express.static(path.join(__dirname, '..', buildFolder)));

/**
 * set the view engine to ejs
 */
app.set('view engine', 'ejs');

/**
 * Persist sessions with mongoStore / sequelizeStore
 * We need to enable sessions for passport-twitter because it's an
 * oauth 1.0 strategy, and Lusca depends on sessions
 */
app.use(session({
  resave: true,
  saveUninitialized: true,
  secret: process.env.SESSION_SECRET,
  store: new MongoStore({
    url: mongoDatabase,
    autoReconnect: true,
  }),
}));

/**
  * Lusca - express server security
  * https://github.com/krakenjs/lusca
  */
if (process.env.NODE_ENV === 'production') {
  app.use(lusca({
    csrf: false,
    xframe: 'SAMEORIGIN',
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    xssProtection: true,
  }));
}

/**
 * Development Settings
 */
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
  app.use(errorhandler());
}

// Allow content from localhost
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,Authorization');
  next();
});

/**
 * Production Settings
 */
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('dev'));
}

/**
 * Bootstrap routes
 */
require('./config/routes')(app);

/**
 * Start Express server.
 */
app.set('port', process.env.PORT || 3000);
app.listen(app.get('port'), () => {
  console.log('Express server listening on port %d in %s mode', app.get('port'), app.get('env'));
});

module.exports = app;
