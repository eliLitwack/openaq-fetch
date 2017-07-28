/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data from StateAir.net data source.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});
import _ from 'lodash';
import { default as moment } from 'moment-timezone';
import { transliterate as tr, slugify } from 'transliteration';

export const name = 'pm25in';
const token = '5j1znBVAsnSf5xQyNQyq';
const locTable = require('../data_scripts/pm25in-locs.json')
/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
export const fetchData = function (source, cb) {
  request('http://www.pm25.in/api/querys/all_cities.json/?token=' + token, function (err, res, body) {
    if (err || res.statusCode !== 200) {
      return cb({message: 'Failure to load data url.'});
    }

    // Wrap everything in a try/catch in case something goes wrong
    try {
      // Format the data
      var data = formatData(body, source);

      // Make sure the data is valid
      if (data === undefined) {
        return cb({message: 'Failure to parse data.'});
      }
      cb(null, data);
    } catch (e) {
        eturn cb({message: 'Unknown adapter error.'});
    }
  });
};

/**
 * Given fetched data, turn it into a format our system can use.
 * @param {object} data Fetched source data
 * @param {object} source A valid source object
 * @return {object} Parsed and standardized data our system can use
 */
var formatData = function (data, source) {
  /**
   * Given a date string, convert to system appropriate times.
   * @param {string} dateString Date in string format coming from source data
   * @return {object} An object containing both UTC and local times
   */
  var getDate = function (dateString) {
    var date = moment.tz(dateString, 'Asia/Shanghai');
    return {utc: date.toDate(), local: date.format()};
  };

  // Create measurements array
  var measurements = [];

  // iterate through stations
  console.log(data[0])
  for (var i = 0; i < data.length; i++) {
    let area;
    if(data[i].area == '泰州'){
      area = 'Tai Zhou Shi'
    } else{
      area = tr(data[i].area)
    }
    let position = tr(data[i].position_name).replace(' )', ')') //deals with trailing whitespace
    let name = position + ' ' + data[i].station_code

    let baseObj = {
        location: name,
        city: area,
        country: 'CN',
        sourceName: source.name,
        sourceType: 'government',
        mobile: false,
        unit: 'µg/m³', // unless it's CO, in which case it's mg/m³
        averagingPeriod: {'value': 1, 'unit': 'hours'},
        date: getDate(data[i].time_point),
        attribution: [{
          name: 'PM25.in',
          url: source.sourceURL
        }]
    };

    let cords = getCoordinates(data[i].station_code);
    if (cords) {
      baseObj.coordinates = cords;
    }

    const parameters = ['so2', 'no2', 'pm10', 'co', 'o3', 'pm2_5'];
    for (var n = 0; n < parameters.length; n++) {
      var param = parameters[n]
      if (data[i][param] !== undefined) {
        var obj = _.cloneDeep(baseObj);
        obj.parameter = param;
        if (param == 'co') {
          obj.value = data[i][param] * 1000;
        } else {
          obj.value = data[i][param];
        }
        measurements.push(obj);
      }
    }
  }
  return measurements
};

export const getCoordinates = function (location) {
  var loc = locTable[location]
  if (loc) {
    var lon = locTable[location][0];
    var lat = locTable[location][1];
    return {latitude: lat, longitude: lon};
  } else {
    return undefined;
  }
};

fetchData(require('../sources/cn.json')[5], function(response) {
  console.log(response)
})
