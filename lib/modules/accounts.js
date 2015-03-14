var conf = require('../config');
var url = require('url');
var log = require('../log');
exports.setup = function(everyauth) {
  everyauth.google
    .configurable({
        scope: "URL identifying the Google service to be accessed. See the documentation for the API you'd like to use for what scope to specify. To specify more than one scope, list each one separated with a space."
    })

    .oauthHost('https://accounts.iiet.pl')
    .apiHost('https://accounts.iiet.pl/m8/feeds')

    .authPath('/oauth/authorize')
    .authQueryParam('response_type', 'code')

    .accessTokenPath('/oauth/token')
    .accessTokenParam('grant_type', 'authorization_code')
    .accessTokenHttpMethod('post')
    .postAccessTokenParamsVia('data')

    .entryPath('/auth/accounts')
    .callbackPath('/auth/accounts/callback')

    .authQueryParam({
        access_type: 'offline'
      , approval_prompt: 'force'
      , scope: function () {
          return this._scope && this.scope();
        }
    })

    .addToSession( function (sess, auth) {
      this._super(sess, auth);
      if (auth.refresh_token) {
        sess.auth[this.name].refreshToken = auth.refresh_token;
        sess.auth[this.name].expiresInSeconds = parseInt(auth.expires_in, 10);
      }
    })

    .authCallbackDidErr( function (req) {
      var parsedUrl = url.parse(req.url, true);
      return parsedUrl.query && !!parsedUrl.query.error;
    })

    .handleAuthCallbackError( function (req, res) {
      var parsedUrl = url.parse(req.url, true)
        , errorDesc = parsedUrl.query.error + "; " + parsedUrl.query.error_description;
      if (res.render) {
        res.render(__dirname + '/../views/auth-fail.jade', {
          errorDescription: errorDesc
        });
      } else {
        // TODO Replace this with a nice fallback
        throw new Error("You must configure handleAuthCallbackError if you are not using express");
      }
    })
    .moduleErrback( function (err, seqValues) {
      if (err instanceof Error) {
        var next = seqValues.next;
        return next(err);
      } else if (err.extra) {
        var accountsResponse = err.extra.res
          , serverResponse = seqValues.res;
        serverResponse.writeHead(
            accountsResponse.statusCode
          , accountsResponse.headers);
        serverResponse.end(err.extra.data);
      } else if (err.statusCode) {
        var serverResponse = seqValues.res;
        serverResponse.writeHead(err.statusCode);
        serverResponse.end(err.data);
      } else {
        console.error(err);
        throw new Error('Unsupported error type');
      }
    })

    .fetchOAuthUser( function (accessToken) {
      console.log(accessToken);
      var promise = this.Promise()
        , userUrl = 'https://accounts.iiet.pl/oauth/v1/public'
        , queryParams = { access_token: accessToken, alt: 'json' };
      request.get({
          url: userUrl
        , qs: queryParams
      }, function (err, res, body) {
        if (err) return promise.fail(err);
        if (parseInt(res.statusCode/100, 10) !== 2) {
          return promise.fail({extra: {data: body, res: res}});
        }
        promise.fulfill(JSON.parse(body));
      });
      return promise;
    })
    .myHostname(conf.hostname)
    .appId(conf.modules.accounts.appId)
    .appSecret(conf.modules.accounts.appSecret)
    .scope('public')
    .findOrCreateUser( function (sess, accessToken, accessTokenExtra, User) {
      return User;
    })
    .handleAuthCallbackError( function (req, res) {
      var parsedUrl = url.parse(req.url, true);
      req.flash('error', 'Error authenticating with accounts: ' + parsedUrl.query.error);
      res.redirectTo('/');
    })
    .convertErr( function (data) {
      if(data.data) {
        return new Error(data.data.match(/H1>(.+)<\/H1/)[1]);
      } else if(data.error && data.error.message) {
        return new Error(data.error.message, data.error);
      } else {
        return new Error(JSON.stringify(data));
      }
    })
    .redirectPath('/');

  everyauth.google.authorize = function(auth) {
    return true;
  };
  everyauth.google.title = "accounts.iiet.pl";
};
