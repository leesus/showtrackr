var gulp = require('gulp');
var sass = require('gulp-sass');
var plumber = require('gulp-plumber');
var uncss = require('gulp-uncss');
var csso = require('gulp-csso');
var uglify = require('gulp-uglify');
var concat = require('gulp-concat');
var templateCache = require('gulp-angular-templatecache');

gulp.task('sass', function(){
  gulp.src('public/stylesheets/style.scss')
    .pipe(plumber())
    .pipe(sass())
    .pipe(uncss({
      html: [
        'public/index.ejs',
        'public/views/add.html',
        'public/views/detail.html',
        'public/views/home.html',
        'public/views/login.html',
        'public/views/signup.html'
      ]
    }))
    .pipe(csso())
    .pipe(gulp.dest('public/stylesheets'));
});

gulp.task('compress', function(){
  gulp.src([
    'public/vendor/angular.js',
    'public/vendor/*.js',
    'public/app.js',
    'public/directives/*.js',
    'public/filters/*.js',
    'public/services/*.js',
    'public/controllers/*.js'
  ])
    .pipe(concat('app.min.js'))
    .pipe(uglify())
    .pipe(gulp.dest('public'));
});

gulp.task('templates', function(){
  gulp.src('public/views/**/*.html')
    .pipe(templateCache({ root: 'views', module: 'Showtrackr' }))
    .pipe(gulp.dest('public'));
});

gulp.task('watch', function(){
  gulp.watch('public/stylesheets/*.scss', ['sass']);
  gulp.watch(['public/**/*.js', '!public/app.min.js', '!public/vendor'], ['compress']);
});

gulp.task('default', ['sass', 'compress', 'templates', 'watch']);