/*
Copyright 2020 Adobe
All Rights Reserved.

NOTICE: Adobe permits you to use, modify, and distribute this file in
accordance with the terms of the Adobe license agreement accompanying
it. If you have received this file from a source other than Adobe,
then your use, modification, or distribution of it requires the prior
written permission of Adobe. 
*/

const xd = require("scenegraph");

function getType(xdNode) {
    if (xdNode instanceof xd.Text) { return exports.TEXT; }
    if (xdNode instanceof xd.Group) { return exports.GROUP; }
    if (xdNode instanceof xd.RepeatGrid) { return exports.REPEATGRID; }
    if (xdNode instanceof xd.SymbolInstance || xdNode instanceof xd.Artboard) {
        return exports.WIDGET;
    }
    if (xdNode instanceof xd.Path || xdNode instanceof xd.Polygon ||
        xdNode instanceof xd.Rectangle || xdNode instanceof xd.Ellipse ||
        xdNode instanceof xd.BooleanGroup || xdNode instanceof xd.Line) {
            return exports.SHAPE;
    }
    return exports.ROOT;
}
exports.getType = getType;

function getXDLabel(xdNode) {
	// not necessarily the ideal location for this method, but it's good to maintain proximity to the other similar methods.
	if (xdNode instanceof xd.Text) { return "text"; }
	if (xdNode instanceof xd.RepeatGrid) { return "repeatGrid"; }
    if (xdNode instanceof xd.Group) { return "group"; }
    if (xdNode instanceof xd.SymbolInstance) { return "component"; }
    if (xdNode instanceof xd.Artboard) { return "artboard"; }
    if (xdNode instanceof xd.Path || xdNode instanceof xd.Polygon ||
        xdNode instanceof xd.Rectangle || xdNode instanceof xd.Ellipse ||
        xdNode instanceof xd.BooleanGroup || xdNode instanceof xd.Line) {
            return "shape";
    }
    return "none";
}
exports.getXDLabel = getXDLabel;

function getLabel(xdNode) {
	// this works fine for now.
	return getType(xdNode);
}
exports.getLabel = getLabel;

exports.TEXT = "text";
exports.GROUP = "group";
exports.WIDGET = "widget";
exports.SHAPE = "shape";
exports.ROOT = "root";
exports.REPEATGRID = "repeatGrid";
