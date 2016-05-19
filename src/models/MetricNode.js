export class MetricNode{
    constructor(nodeValue, incrementalPath){
        this.childs = [];
        this.leafs = [];
        this.data =nodeValue;
        this.incrementalPath = incrementalPath;
    }

    isLeaf(){
        return this.childs.empty() && this.leafs.empty()
    }

    addElement(currentPath, list){
        var currentChild = new MetricNode(list[0], currentPath+"."+list[0]);
        if ( list.length == 1 ) {
            this.leafs.push(currentChild);
            return;
        }
        else{
            var index = -1;
            var i =0;
            for( ; i<this.childs.length; i++){
                var child = this.childs[i];
                if(currentChild.incrementalPath === child.incrementalPath && currentChild.data === child.data){
                    index = i;
                    break;
                }
            }

            if ( index == -1 ) {
                this.childs.push(currentChild);
                currentChild.addElement(currentChild.incrementalPath, list.slice(1, list.length));
            }
            else{
                var nextChild = this.childs[index];
                nextChild.addElement(currentChild.incrementalPath, list.slice(1, list.length));
            }
        }
    }
}
