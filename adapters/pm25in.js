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

export const name = 'pm25in';
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
 * From a city name in Chinese characters and a station name in chinese characters, get the coordinates of the station
 * @param {object} city A city name in Chinese characters
 * @param {object} station A station name in Chinese characters
 * @return {object} if the location is known, an object with 'latitude' and 'longitude' properties, otherwise undefined
 */
var getCoordinates = function (city, station) {
  let cords = require('../data_scripts/china-locations.json')[city + station];
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

  // parse date-time: get the live_data_time class which contains the date-time of the measurement in chinese date time format
  let time = getDate($('.live_data_time').text());

  //find the city name
  let thisCity = $('.city_name').text().replace(/\s+\s|\\r|\\n/g, '')

  $('#detail-data').find('tr').each(function (i, elem) {
    let entries = $(elem).children();
    let stationName = $(entries[0]).text().replace(/\s+\s|\\r|\\n/g, ''); //regex removes whitespace and endline chars
    let values = {};
    values.pm25 = entries[4]
    values.pm10 = entries[5]
    values.co = entries[6]
    values.no2 = entries[7]
    values.o3 = entries[8] //skips a number because there is an 8-hour average o3 value that we don't use
    values.so2 = entries[10]
    for (var key in values) {
      values[key] = values[key].children[0].data.replace(/\s+\s|\\r|\\n/g, '');
      if (!isNaN(values[key])) {
        values[key] = parseFloat(values[key])

        if (key === 'co') {
          values[key] = values[key] * 1000; //because Chinese sources report CO in mg/m³, not µg/m³
        }

        let obj = {
          location: tr(thisCity + stationName),
          parameter: key,
          unit: 'µg/m³',
          averagingPeriod: {'value': 1, 'unit': 'hours'},
          date: time,
          value: parseFloat(values[key]),
          attribution: [{
            name: 'PM25.in from BestApp',
            url: "http://pm25.in"
          }]
        };
        let cords = getCoordinates(thisCity, stationName);
        if (cords) {
          obj.coordinates = cords;
        }
        measurements.push(obj);
      }
    }
  });
  return {
    name: 'unused',
    measurements: measurements
  };
};
