import angular from 'angular';

function ReposeAPIWrapper($q, $http) {

    class ReposeAPI {
        constructor(api_url, username, apiKey) {
        // Initialize API parameters.
            this.url              = api_url;
            this.username         = username;
            this.apiKey           = apiKey ;
            this.getIdentity();
        }

        getIdentity() {
            var options = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                url: this.url,
                data: {
                    "auth":
                    {
                        "RAX-KSKEY:apiKeyCredentials":
                        {
                            "username": this.username,
                            "apiKey": this.apiKey
                        }
                    }
                }
            };

            var self = this;
            return $http(options).then(function (response) {
                if (!response.data) {
                    return [];
                }
                //TODO: Handle Repose Errors
                self.authToken = response.data.access.token;
                return p.getToken();
            });
        }

        getToken() {
            return this.authToken;
        }
    }
    return ReposeAPI;
}

angular
    .module('grafana.services')
    .factory('ReposeAPI', ReposeAPIWrapper);