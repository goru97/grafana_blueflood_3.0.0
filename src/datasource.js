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
        var from = Math.ceil(dateMath.parse(options.rangeRaw.from)) - (60*1000),
            to = Math.ceil(dateMath.parse(options.rangeRaw.to)) + (60*1000),
            start_time = Math.floor(from/1000),
            end_time = Math.floor(to/1000),
            resolution = this.queryHelper.calculateResolution(start_time, end_time),
            step = this.queryHelper.secs_per_res[resolution],
            real_end_time = end_time+step,
            metric_promises = [],
            metric_payload = [];
            alert(start_time);
            alert(end_time);
            alert(resolution);
            alert(real_end_time);

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
                var response = this.queryHelper.response; //TODO:Use the actual response from the above request
                response.metrics.forEach(metric => {
                    var result = this.processMetricValues(metric, start_time, real_end_time, step);
                    alert(JSON.stringify(result));
                }) //TODO: Make it asynchronous
                alert(JSON.stringify(metric_payload));
            }
        }));
    }

    processMetricValues(metric, start_time, end_time, step){
        var key = metric.metric,
            values = metric.data,
            v_iter = values,
            ret_arr = [],
            current_fixup = null,
            fixup_list = [];
        this.range(start_time, end_time, step).forEach(ts =>{
            while(this.current_datapoint_passed(v_iter, ts)){
                v_iter = v_iter.slice(1, v_iter.length);
            }
            if (this.current_datapoint_valid(v_iter, ts, step)){
                ret_arr.push(v_iter[0].average);
                if (current_fixup !== null){
                    fixup_list.push([current_fixup, ret_arr.length - 1]);
                    current_fixup =null;
                }
            }
            else{
                var l = ret_arr.length
                if (l > 0 && typeof ret_arr[l - 1] !== null){
                    current_fixup = l-1;
                    ret_arr.push(null);
                }
            }
        })
        this.fixup(ret_arr, fixup_list);
        return ret_arr;
    }

    current_datapoint_passed(v_iter, ts){
        if(typeof v_iter === 'undefined' || v_iter.length === 0){
           return false;
        }
        var datapoint_ts = (v_iter[0].timestamp)/1000;
        if (ts > datapoint_ts){
            return true;
        }
        return false;
    }

    current_datapoint_valid(v_iter, ts, step){
        if(typeof v_iter === 'undefined' || v_iter.length === 0){
            return false;
        }
        var datapoint_ts = (v_iter[0].timestamp)/1000;
        if (datapoint_ts < (ts + step)){
            return true;
        }
        return false;
    }

    fixup(values, fixup_list){
        fixup_list.forEach(f => {
            var start = f[0],
                end = f[1],
                increment = (values[end] - values[start])/(end - start),
                nextval = values[start];
            this.range(start + 1, end).forEach(x => {
                nextval += increment;
                values[x] = nextval
            })
        })
    }

    range(start, stop, step) {
        if (typeof stop == 'undefined') {
            // one param defined
            stop = start;
            start = 0;
        }

        if (typeof step == 'undefined') {
            step = 1;
        }

        if ((step > 0 && start >= stop) || (step < 0 && start <= stop)) {
            return [];
        }

        var result = [];
        for (var i = start; step > 0 ? i < stop : i > stop; i += step) {
            result.push(i);
        }

        return result;
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
        if(typeof options.data !== 'undefined'){
            httpOptions.data = options.data;
        }
        return this.backendSrv.datasourceRequest(httpOptions);
    }
}