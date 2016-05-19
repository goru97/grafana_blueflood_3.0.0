import _ from "lodash";
import * as dateMath from 'app/core/utils/datemath';
import './repose';
import angular from 'angular';
import {MetricTree} from './models/MetricTree';
import {MetricNode} from './models/MetricNode';
import {QueryHelper} from './query_helper'

export class BluefloodDatasource {

    constructor(instanceSettings, $q, templateSrv, backendSrv, ReposeAPI) {
        this.type = instanceSettings.type;
        this.url = instanceSettings.jsonData.bfUrl;
        this.tenantID = instanceSettings.jsonData.bfTenantID;
        this.name = instanceSettings.name;
        this.q = $q;
        this.templateSrv = templateSrv;
        this.backendSrv = backendSrv;
        this.identityURL      = "https://identity.api.rackspacecloud.com/v2.0/tokens";
        this.username         = instanceSettings.jsonData.raxUserName;
        this.apikey           = instanceSettings.jsonData.raxApikey;
        this.reposeAPI = new ReposeAPI(this.identityURL, this.username, this.apikey);
        this.queryHelper = new QueryHelper();
        this.useMultiEP = true;
    }

    testDatasource() {
        return this.backendSrv.datasourceRequest({
                url: this.url + '/test',
                method: 'GET'
            }).then(response => {
                return {status: "success", message: "Data source is not working", title: "Success"};
    });
    }

    annotationQuery(options) {
        try {
            var tags = '';
            if (options.tags) {
                tags = '&tags=' + options.tags;
            }
            var from = Math.ceil(dateMath.parse(options.rangeRaw.from)),
                to = Math.ceil(dateMath.parse(options.rangeRaw.to)),
                uri = '/events/getEvents?from=' + from + '&until=' + to + tags,
                d = this.q.defer();

            this.doAPIRequest({
                method: 'GET',
                url: uri
            }, this.reposeAPI.getToken()).then(angular.bind(this,function (response) {
                if (response.status === 401) {
                    this.doAPIRequest({
                        method: 'GET',
                        url: uri
                    }, this.reposeAPI.getIdentity()).then(angular.bind(this,function (response) {
                        if (response.status / 100 === 4 || response.status === 500) {
                            alert("Error while connecting to Blueflood!");
                            d.reject(err);
                        }

                        d.resolve(this.parseAnnotations(response));
                    }));
                }
                else
                    d.resolve(this.parseAnnotations(response));
            }));
        }
        catch (err) {
            d.reject(err);
        }
        return d.promise;

    }

    parseAnnotations(response){
        var list = [];
        response.data.forEach(e => {
            list.push({
            annotation: {},
            time: e.when,
            title: e.what,
            tags: e.tags,
            text: e.data
        });
    });
        return list;
    }

    metricFindQuery(query) {
        var interpolated;
        try {
            interpolated = encodeURIComponent(this.templateSrv.replace(query));
        } catch (err) {
            return this.q.reject(err);
        }
        var params = interpolated.split('.'),
            i = 0,
            tree = new MetricTree(new MetricNode("root", "root"));

        return this.doAPIRequest({method: 'GET', url: '/metrics/search?query=' + interpolated }).then(
                angular.bind(this, function(results) {
                    results = results.data.map(v => v.metric);
                    results.forEach(d => tree.addElement(d));
                    return this.fetchElements(tree.root, params.length);
            }));
    }

    fetchElements(root, depth){
        depth--;
        var resp = [];
        if(depth === 0){
            root.childs.forEach(c => {
                var obj = {};
            obj.text = c.data;
            obj.expandable = 1;
            obj.leaf = 0;
            obj.id = c.data;
            obj.allowChildren = 1;
            resp.push(obj);
        });
            root.leafs.forEach(l => {
                var obj = {};
            obj.text = l.data;
            obj.expandable = 0;
            obj.leaf = 1;
            obj.id = l.data;
            obj.allowChildren = 0;
            resp.push(obj);
        });
            return resp;
        }

        var final_resp = [];
        root.childs.forEach(c => {
            var child_resp = this.fetchElements(c, depth);
        child_resp.forEach(r => final_resp.push(r));
    });

        return final_resp;
    }

    query (options) {
        var from = Math.ceil(dateMath.parse(options.rangeRaw.from)),
            to = Math.ceil(dateMath.parse(options.rangeRaw.to)),
            resolution = this.queryHelper.calculateResolution(from/1000, to/1000),
            metric_promises = [],
            metric_payload = [];

        var doFindQuery = function(target, self){
            var d = self.q.defer();
            self.doAPIRequest({method: 'GET', url: '/metrics/search?query=' + target.target }).then(function(results){
                results = results.data.map(v => v.metric);
                d.resolve(results);
            })
            metric_promises.push(d.promise);
        }

        options.targets.forEach(target => doFindQuery(target, this));
        this.q.all(metric_promises).then(angular.bind(this, function(results) {
            results.forEach(result => result.forEach(metric => metric_payload.push(metric)));
            if(this.useMultiEP){

                //TODO: Get metrics using this once CORS issue is fixed in Blueflood.
                /*this.doAPIRequest({method: 'POST', url: '/views?from='+from+'&to='+to+'&resolution='+resolution,
                                   data: metric_payload}).then(function(results){
                    alert(JSON.stringify(results));
                })*/
                alert(JSON.stringify(metric_payload));
            }
        }));
    }

    doAPIRequest(options, token) {
        var headers = { 'Content-Type': 'application/json' }
        if(typeof token !== 'undefined'){
            headers['X-Auth-Token'] = token.id
        }
        var httpOptions = {
            url: this.url + '/v2.0/'+this.tenantID+options.url,
            method: options.method,
            headers: headers
        };
        if(options.data !== 'undefined'){
            httpOptions.data = options.data;
        }
        return this.backendSrv.datasourceRequest(httpOptions);
    }
}