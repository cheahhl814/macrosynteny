export class Tooltip {
    el;
    constructor(selector = "#tooltip") {
        this.el = d3.select(selector).empty() ?
            d3.select("body").append("div").attr("id", "tooltip").attr("class", "tooltip") :
            d3.select(selector);
    }
    show(e, content) {
        this.el.style("display", "block")
            .style("opacity", 1)
            .html(content);
        this.move(e);
    }
    move(e) {
        const node = this.el.node();
        if (!node)
            return;
        const tw = node.offsetWidth;
        const th = node.offsetHeight;
        let tx = e.clientX + 15;
        let ty = e.clientY + 15;
        // Overflow checks
        if (tx + tw > window.innerWidth - 20)
            tx = e.clientX - tw - 15;
        if (ty + th > window.innerHeight - 20)
            ty = e.clientY - th - 15;
        this.el.style("left", tx + "px").style("top", ty + "px");
    }
    hide() {
        this.el.style("display", "none").style("opacity", 0);
    }
}
