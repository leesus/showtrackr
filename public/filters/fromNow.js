angular.module('Showtrackr')
  .filter('fromNow', function(){
    return function(date) {
      return moment(date).fromNow();
    }
  });