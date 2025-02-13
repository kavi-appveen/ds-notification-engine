"use strict";

const mongoose = require("mongoose");
const definition = require("../helpers/events.definition.js").definition;
const SMCrud = require("@appveen/swagger-mongoose-crud");
const utils = require("@appveen/utils");
const schema = new mongoose.Schema(definition);
const logger = global.logger;
const isEmail = require("validator").isEmail;
const _ = require("lodash");

var options = {
    logger: logger,
    collectionName: "event"
};
utils.counter.setDefaults("event", 1000);
schema.pre("validate", function (next) {
    var smsObj = JSON.parse(JSON.stringify(this.sms));
    var phoneNumPatt = /^\+?[0-9]{0,}(?=.*)[- ()0-9]*$/;
    if (!_.isEmpty(smsObj)) {
        _.isEmpty(smsObj.number) ? next(new Error("SMS number is empty")) : null;
        phoneNumPatt.test(smsObj.number) ? null : next(new Error("SMS number invalid"));
    }
    if (this.defaultRecipientList) {    
        this.defaultRecipientList.forEach(obj => {
            obj.type = obj.type.toLowerCase();
            obj.destination = _.trim(obj.destination);
            if (!((obj.type === "email" && isEmail(obj.destination)) || (obj.type === "sms" && phoneNumPatt.test(obj.destination))))
                next(new Error(`Destination ${obj.destination} is invalid`));
            // obj.type === 'email' ? isEmail(obj.destination) ? null : next(new Error('invalid email in defaultRecipientList')) : phoneNumPatt.test(obj.destination) ? null : next(new Error('invalid number in defaultRecipientList'));
        });
    }
    if ((!_.isEmpty(JSON.parse(JSON.stringify(this.email)))) && !(this.email.address && isEmail(this.email.address))) {
        next(new Error("Invalid email address"));
    }
    if(!_.isEmpty(JSON.parse(JSON.stringify(this.email)))){
        this.email.name = _.trim(this.email.name);
        if(!this.email.name)  next(new Error("Invalid name in email object"));
    }
    if(!_.isEmpty(JSON.parse(JSON.stringify(this.sms)))){
        this.sms.name = _.trim(this.sms.name);
        if(!this.sms.name)  next(new Error("Invalid name in sms object"));
    }
    this.name = _.trim(this.name);
    _.isEmpty(this.name) ? next(new Error("Name is empty")) : null;
    this.description = _.trim(this.description);
    next();
});

schema.pre("remove", function (next) {
    var self = this;
    mongoose.model("subscription").find({
        "eventID": self._id
    }, {
        _id: 1
    }, (err, docs) => {
        if (err) next(new Error("Error querying DB!"));
        if (docs.length > 0) {
            next(new Error("Event " + self._id + " still in use."));
        } else {
            next();
        }
    });
});

schema.pre("save", function (next) {
    mongoose.model("template").find({
        "_id": {
            $in: this.templateIDs
        }
    }, {
        _id: 1
    }, (err, docs) => {
        if (err) next(new Error("Error querying DB!"));
        if (docs.length > 0) {
            let unmatchedIds = [];
            this.templateIDs.forEach(_tid => {
                let unMatched = true;
                docs.forEach(_d => {
                    if (_d._id == _tid) unMatched = false;
                });
                if (unMatched) unmatchedIds.push(_tid);
            });
            if (unmatchedIds.length > 0) next(new Error("The following template ids were not found : " + unmatchedIds.join(", ")));
            else {
                this.templateIDs = _.uniq(this.templateIDs);
                this.defaultRecipientList = _.uniqBy(this.defaultRecipientList, (obj) => {
                    return obj.destination + "_" + obj.type;
                });
                next();
            }
        } else next(new Error("No valid templates provided!"));
    });
});
schema.pre("save", utils.counter.getIdGenerator("EVT", "event"));

var crudder = new SMCrud(schema, "event", options);
module.exports = {
    create: crudder.create,
    index: crudder.index,
    show: crudder.show,
    destroy: crudder.destroy,
    update: crudder.update,
    count: crudder.count
};