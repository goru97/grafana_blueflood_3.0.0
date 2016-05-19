export class MetricTree {
    constructor(root) {
        this.root = root;
    }

    addElement(elementValue) {
        var list = elementValue.split('.');
        this.root.addElement(this.root.incrementalPath, list);
    }

    getCommonRoot() {
        if (this.commonRoot != null) return this.commonRoot;else {
            var current = this.root;
            while (current.leafs.length <= 0) {
                current = current.childs[0];
            }
            this.commonRoot = current;
            return this.commonRoot;
        }
    }
}

//# sourceMappingURL=MetricTree-compiled.js.map