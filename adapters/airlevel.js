/**
 * This code is responsible for implementing all methods related to fetching
 * and returning data from Anhui's Enviormental Protection Ministry data source.
 */
'use strict';

import { REQUEST_TIMEOUT } from '../lib/constants';
import { default as baseRequest } from 'request';
import cheerio from 'cheerio';
import { default as moment } from 'moment-timezone';
import {transliterate as tr} from 'transliteration';
const request = baseRequest.defaults({timeout: REQUEST_TIMEOUT});

export const name = 'airlevel';
/**
 * Fetches the data for a given source and returns an appropriate object
 * @param {object} source A valid source object
 * @param {function} cb A callback of the form cb(err, data)
 */
export const fetchData = function (source, cb) {
  request(source.url, function (err, res, body) {
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
      return cb({message: 'Unknown adapter error'});
    }
  });
};

/**
 * From a Station name in chinese characters, get the coordinates of the station
 * @param {object} station A station name in Chinese characters (starting with the station's city name)
 * @return {object} if the location is known, an object with 'latitude' and 'longitude' properties, otherwise undefined
 */
var getCoordinates = function (station) {
  let cords = require('../data_scripts/china-locations.json')[station];
  if (cords) {
    var lon = cords[0];
    var lat = cords[1];
    return {latitude: lat, longitude: lon};
  } else {
    return undefined;
  }
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
    var date = moment.tz(dateString, 'YYYY-MM-DD HH:mm:ss', 'Asia/Shanghai');
    return {utc: date.toDate(), local: date.format()};
  };

  // Create measurements array
  var measurements = [];

  // load data
  var $ = cheerio.load(data);

  // parse date-time
  // get the title of first table (which is the table of government/research sources - the second table is private sources)
  // which contains the date-time of the measurement in chinese date time format (year年month月day号hour时)
  // the regex matches the chinese date time
  let time = $('.label-info').text().match(/\d+/g);

  // reassemble into western date time
  time = time[1] + '/' + time[2] + '/' + time[0] + ' ' + time[3] + ':' + time[4] +':00';
  time = getDate(time);

  $('.text-center').find('tr').each(function (i, elem) {
    if (i !== 0) { //first row is the headers, not data
      let entries = $(elem).children();
      let stationName = $(entries[0]).text().replace(/\s+\s|\\r|\\n/g, ''); //regex removes whitespace and endline chars
      let values = {};
      values.pm25 = entries[3]
      values.pm10 = entries[4]
      for (var key in values) {
        values[key] = values[key].children[0].data.match(/\d+/);
        if (!isNaN(values[key]) && values[key] !== null) { //aparently null counts as a number in javascript? handles that edge case
          values[key] = parseFloat(values[key])

          if (key === 'co') {
            values[key] = values[key] * 1000; //because Chinese sources report CO in mg/m³, not µg/m³
          }

          let obj = {
            location: tr(stationName),
            parameter: key,
            unit: 'µg/m³',
            averagingPeriod: {'value': 1, 'unit': 'hours'},
            date: time,
            value: parseFloat(values[key]),
            attribution: [{
              name: 'Air Level',
              url: "air-level.com"
            }]
          };
          let cords = getCoordinates(stationName);
          if (cords) {
            obj.coordinates = cords;
          }
          measurements.push(obj);
        }
      }
    }
  });
  return {
    name: 'unused',
    measurements: measurements
  };
};
