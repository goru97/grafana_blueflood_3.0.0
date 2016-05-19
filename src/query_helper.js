export class QueryHelper {

    constructor(){
        this.secs_per_res = {
            FULL: 60,
            MIN5: 5 * 60,
            MIN20: 20 * 60,
            MIN60: 60 * 60,
            MIN240: 240 * 60,
            MIN1440: 1440 * 60
        }
    }

    calculateResolution(start, stop){
        var num_points = (stop - start) / 60,
            res = 'FULL',
            secs_per_res = this.secs_per_res;
            if (num_points > 400) {
                num_points = (stop - start) / secs_per_res.MIN5
                res = 'MIN5'
            }
            if (num_points > 800) {
                num_points = (stop - start) / secs_per_res.MIN20
                res = 'MIN20'
            }
            if (num_points > 8000) {
                num_points = (stop - start) / secs_per_res.MIN60
                res = 'MIN60'
            }
            if (num_points > 800){
                num_points = (stop - start) / secs_per_res.MIN240
                res = 'MIN240'
            }
            if (num_points > 800) {
                num_points = (stop - start) / secs_per_res.MIN1440
                res = 'MIN1440'
            }
        return res
    }

}
