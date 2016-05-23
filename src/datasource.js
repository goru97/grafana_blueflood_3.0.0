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
        this.identityURL = "https://identity.api.rackspacecloud.com/v2.0/tokens";
        this.username = instanceSettings.jsonData.raxUserName;
        this.apikey = instanceSettings.jsonData.raxApiKey;
        this.reposeAPI = new ReposeAPI(this.identityURL, this.username, this.apikey);
        this.queryHelper = new QueryHelper();
        this.useMultiEP = true;
        this.rax_hosted_enabled = true;
    }

    testDatasource() {
        return this.backendSrv.datasourceRequest({
            url: this.url + '/test',
            method: 'GET'
        }).then(response => {
            return {status: "success", message: "Data source is not working", title: "Success"};
        });
    }

    query(options)
    {
        var from = Math.ceil(dateMath.parse(options.rangeRaw.from)) - (60 * 1000),
            to = Math.ceil(dateMath.parse(options.rangeRaw.to)) + (60 * 1000),
            start_time = Math.floor(from / 1000),
            end_time = Math.floor(to / 1000),
            resolution = this.queryHelper.calculateResolution(start_time, end_time),
            step = this.queryHelper.secs_per_res[resolution],
            real_end_time = end_time + step,
            metric_promises = [],
            metric_payload = [];

        options.targets.forEach(target => {
            metric_promises.push(this.doAPIRequest({method: 'GET', url: '/metrics/search?query=' + target.target}))
        });

        return this.q.all(metric_promises).then(angular.bind(this, function (results) {
            results = results.map(function (result) {
                return result.data
            });
            results.forEach(result => {
                result = result.map(function (v) {
                    return v.metric
                });
                result.forEach(metric => metric_payload.push(metric))
            });
            var ret_vals = [];
            if (this.useMultiEP) {
                //TODO: Get metrics using this once CORS issue is fixed in Blueflood.
                /*this.doAPIRequest({method: 'POST', url: '/views?from='+from+'&to='+to+'&resolution='+resolution,
                 data: metric_payload}).then(function(results){
                 alert(JSON.stringify(results));
                 })*/
                var response = this.queryHelper.response; //TODO:Use the actual response from the above request
                response.metrics.forEach(metric => {
                    var key = metric.metric, //TODO:Find the actual key (With func like alias etc)
                        values = metric.data,
                        datapoints = this.queryHelper.processValues(values, start_time, real_end_time, step),
                        result = {};
                    result.target = key;
                    result.datapoints = datapoints;
                    ret_vals.push(result);
                }); //TODO: Make it asynchronous
            }
            return {data: ret_vals};
        }));
    }

    annotationQuery(options) {
            var tags = '';
            if (options.tags) {
                tags = '&tags=' + options.tags;
            }
            var from = Math.ceil(dateMath.parse(options.rangeRaw.from)),
                to = Math.ceil(dateMath.parse(options.rangeRaw.to)),
                uri = '/events/getEvents?from=' + from + '&until=' + to + tags,
                d = this.q.defer();

            this.doAPIRequest({method: 'GET', url: uri}).then(angular.bind(function (response) {
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

                d.resolve(this.parseAnnotations(list));
            }));
            return d.promise;
        }

    metricFindQuery(query)
    {
        var interpolated;
        try {
            interpolated = encodeURIComponent(this.templateSrv.replace(query));
        } catch (err) {
            return this.q.reject(err);
        }
        var params = interpolated.split('.'),
            i = 0,
            tree = new MetricTree(new MetricNode("root", "root"));

        return this.doAPIRequest({method: 'GET', url: '/metrics/search?query=' + interpolated}).then(
            angular.bind(this, function (results) {
                results = results.data.map(v => v.metric);
                results.forEach(d => tree.addElement(d));
                return this.fetchElements(tree.root, params.length);
            }));
    }

    fetchElements(root, depth)
    {
        depth--;
        var resp = [];
        if (depth === 0) {
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

    doAPIRequest(options)
    {
        var httpOptions = {
            url: this.url + '/v2.0/' + this.tenantID + options.url,
            method: options.method,
            headers: {'Content-Type': 'application/json'}
        };
        if (typeof options.data !== 'undefined') {
            httpOptions.data = options.data;
        }

        if (this.rax_hosted_enabled === true) {
            var d = this.q.defer(),
                token = this.reposeAPI.getToken();
            if (typeof token !== 'undefined') {
                httpOptions.headers['X-Auth-Token'] = token.id
            }
            this.backendSrv.datasourceRequest(httpOptions).then(angular.bind(this, function (response) {
                if (response.status === 401) {  //Retry if token is expired
                    token = this.reposeAPI.getIdentity();
                    if (typeof token !== 'undefined') {
                        httpOptions.headers['X-Auth-Token'] = token.id
                    }
                    this.backendSrv.datasourceRequest(httpOptions).then(angular.bind(this, function (response) {
                        if (response.status / 100 === 4 || response.status === 500) { //TODO: Use math.floor
                            d.reject(err);
                        }
                        d.resolve(response);
                    }));
                }
                else {
                    d.resolve(response);
                }
            }));
            return d.promise
        }
        return this.backendSrv.datasourceRequest(httpOptions);
    }
}
