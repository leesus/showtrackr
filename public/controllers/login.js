angular.module('Showtrackr')
  .controller('LoginCtrl', ['$scope', 'Auth', function($scope, Auth){
    $scope.login({
      email: $scope.email,
      password: $scope.password
    })
  }]);