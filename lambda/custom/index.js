const Alexa = require('ask-sdk-core');
const apiRequest = require('./apiRequest');
const db = require('./dbconnect');
const request = require('request');

/* test */

/* get random response fom alexa as long as not equal to the last response 
*  @param lastRespone - string value of last response
*  @param arr - array with string options for new response
*  @return - new response string 
**/
function getRandom(lastResponse, arr) {
  var response = '';
  do {
    response = arr[Math.floor(Math.random() * (arr.length - 0)) + 0];
  } while(response === lastResponse);
  return response;
}

/* checks whether a given slot exists and returns its value if so, otherwise returns false 
*  we check slot.resolutions first as synonyms resolve different than straight matches
*  @param request - alexa request object 
*  @param slotName - string value of the intent slot key
*  @return - false if invalid otherwise returns to lower cased string value of slot
**/
function isSlotValid(request, slotName) {
  var slot = request.intent.slots[slotName];
  var slotValue;
  if (slot && slot.resolutions) {
    console.log("MULTIPLE SLOT VALUES RETURNED");
    console.log(slot.resolutions.resolutionsPerAuthority[0]);
    console.log("VALUE: " + slot.resolutions.resolutionsPerAuthority[0].values[0].value.name);
    slotValue = slot.resolutions.resolutionsPerAuthority[0].values[0].value.name.toLowerCase();
    return slotValue;

  } else if(slot && slot.value){
    slotValue = slot.value.toLowerCase();
    return slotValue;
  } else {
    return false;
  }
}

/* checks if request body has results, if not returns false, otherwise returns exact match 
*  or failing a match returns the top match 
*  @param body - the raw JSON body
*  @param searchExpression - the name of the food item to be checked against the results
*  @return - false if no results otherwise the object with the food item and serving data
**/
function searchJSON(body, searchExpression){
  var json = JSON.parse(body); 
  var foodName = "";
  var foodID = "";
  var exactMatch = 0;
  var searchResults= {};
  if(json.foods.total_results !== "0") {
    /* loop through set of results to find matching food item */
    for(var i = 0; i < json.foods.food.length; i++) {
      var obj = json['foods']['food'][i]['food_name'];
      if(obj.toLowerCase().trim() == searchExpression.toLowerCase().trim()) {
        exactMatch = 1;
        foodName = obj;
        foodID = json['foods']['food'][i]['food_id'];
        return searchResults = {name: foodName, ID : foodID, match: exactMatch};
      }
    } /* if we have results but no exact match we return the top result instead */
    if(exactMatch === 0) {
      searchResults = {
        name: json['foods']['food'][0]['food_name'], 
        ID : json['foods']['food'][0]['food_id'], 
        match: exactMatch
      };
    }
    return searchResults; 
  }
  return false;
}

/* process and return the JSON for a food search result
*  @param body - the raw JSON body of our food result
*  @return - the food serving that is measured in grams for our food item
**/
function foodGetJSON(body){
  var json = JSON.parse(body); 
  var serving = json['food']['servings']['serving'];
  var searchResults ={
    name: json['food']['food_name'],
    food_id: json['food']['food_id'],
    food_type: json['food']['food_type'],
    serving: null,
    isArray: false
  };
  let len = json.food.servings.serving.length;
  if(len) {
    for(var i = 0; i < serving.length; i++) {
      /* TODO need to come up with better solution than just checking for grams */
      if(serving[i]['metric_serving_unit'] == "g") {
        searchResults.isArray = true;
        searchResults.serving = serving[i];
        return searchResults;
      }
    }
  } else { /* result only has one serving so return that */
    searchResults.serving = serving;
  }
  return searchResults; 
}

/* calls a search for a given food item, returns a promise in order to make 
*  it possible to await results as API calls need to waited on 
*  @param value - the name of the food item to search the fat secret database for
*  @return - our food search results processed into a js object
**/
async function searchFoodItem(value) {
  let res_body; 
  let results;  
  try {
    res_body = await apiRequest.handler.searchFood(value);
    results = searchJSON(res_body, value);
    res_body = await apiRequest.handler.getFood(results.ID);
    results = foodGetJSON(res_body, value);
  } catch(err) {
    console.log("ERROR WITH FAT SECRET API CALL");
    console.log(err);
  }
  return new Promise(function (resolve, reject) {
    resolve(results);
  });
}

/* sends a request to the API handler for a kiosk scan activation, returned as 
*  promise so other functions can wait on it  
*  @param username - username to be used for API call to kiosk server
*  @param pin - 4 digit pin for kiosk API call
*  @return - the results body of the kiosk scan API call
**/
async function requestKioskScan(username, pin) {
  let resultsBody;
  try {
    resultsBody = await apiRequest.handler.kioskScan(username, pin);
    
  } catch(err) {
    console.log("ERROR WITH KIOSK SCAN REQUEST");
    console.log(err);
  }
  return new Promise(function (resolve, reject) {
    resolve(resultsBody);
  });
}

/* adds values to session state without deleting others, basically a neat 
*  wrapper for the alexa setSessionAttributes method 
*  @param values - object with our session values to be updated
*  @param handlerInput - alexa object needed to access existing session attributes
**/
function addSessionValues(values, handlerInput) {
  let session = handlerInput.attributesManager.getSessionAttributes();
  for(let name of Object.keys(session)) {
    if(values[name]) {
      session[name] = values[name];
    }
  }
  handlerInput.attributesManager.setSessionAttributes(session);
}

/* normalizes a results set to a given serving weight 
*  @param amount - amount in grams to normalize all food nutrients to
*  @param results - our food results object with serving nutrient data
*  @return - updated food item object with standardized nutrient amounts
*            as per given serving amount in param amount
**/
function normalizeWeights(amount, results) {
  var mod = parseFloat(amount) / parseFloat(results.serving.metric_serving_amount);
  if(results.metric_serving_unit === "oz") {
    mod = mod * 28.3495;
  }
  for(let key of Object.keys(results.serving)) {
    if(!isNaN(Number(results.serving[key])) && key != 'serving_id') {
      results.serving[key] = Number(results.serving[key]) * mod;
      results.serving[key] = Number(Math.round(results.serving[key]+'e'+2)+'e-'+2);
    }
  }
  return results;
}

/* builds a food search speech response based on if attribute is provided 
*  or upon a standard set of attributes zero values are ignored
*  @param results - object with our food item and serving information
*  @param handlerInput - alexa handlerInput interface
*  @param attribute - if user has specified a particular nutrient for food
*                     search we build around that, otherwise response is built
*                     around protein, carbs, sugar and fat if not 0
*  @return - string value with food search results to be said by alexa to user
**/

var proteinatt;
var fatatt;
var sugaratt;
var carbatt;

function buildFoodSearchResponse(results, handlerInput, attribute) {
  const session = handlerInput.attributesManager.getSessionAttributes();
  /* we can randomise the start so responses are less repetive */
  var speechText = getRandom(session.lastFoodItemResponse, [
    'a ',
    ' ',
    'per ',
    'I found results for you, a ',
    'Search succesful, a '
  ]);
  speechText += `${Math.floor(results.serving.metric_serving_amount)} gram serving`;
  speechText += ` of ${results.name} contains`;
  var atts = ['protein', 'fat', 'sugar', 'carbohydrate'];
  proteinatt = `${results.serving[atts[0]]}`;
  fatatt = `${results.serving[atts[1]]}`;
  sugaratt = `${results.serving[atts[2]]}`;
  carbatt =  `${results.serving[atts[3]]}`;

  if(!attribute) {
    for(var i = 0; i < atts.length; i++) {
      if(results.serving[atts[i]] != 0) {
        speechText += ` ${results.serving[atts[i]]} grams of ${atts[i]},`;  
        //totalresults += `${results.serving[atts[i]]}`;
      }
    }
  } else {
    console.log("NUTRIENT AMOUNT: " + results.serving[attribute]);
    if(results.serving[attribute] != 0) {
      speechText += ` ${results.serving[attribute]}`;
      /* these are measured in milligrams not grams */
      if(attribute === 'sodium' || attribute === 'cholesterol') {
        speechText += ` milligrams of ${attribute.replace("_", " ").trim()}`;
      } else {
        speechText += ` grams of ${attribute.replace("_", " ").trim()},`;
      }
    } else {
      speechText += ` no ${attribute.replace("_", " ").trim()}`;
    }
  }
  return speechText;
}

/* creates a response string for the more information intent handler 
*  @param session - object containing all current session data
*  @param slotValue - the value of the nutrient slot we are building for
*  @return - the string value for the more info intent response 
**/
function buildMoreInfoResponse(session, slotValue) {
  let amount = Math.floor(session.lastFoodResult.serving['metric_serving_amount']);
  let value = session.lastFoodResult.serving[slotValue.replace(" ", "_").trim()];
  let name = session.lastFoodResult.name;
  let attAmount = 'grams';
  if(slotValue === 'sodium' || slotValue === 'cholesterol') {
    attAmount = 'milligrams';
  }
  let speechText = getRandom(session.lastMoreInfoResponse, [
    `it has ${value} ${attAmount} of ${slotValue} per ${amount} grams of ${name}`,
    `${amount} grams of ${name} has ${value} ${attAmount} of ${slotValue}`,
    `per ${amount} grams of ${name} there is ${value} ${attAmount} of ${slotValue}`
  ]);
  return speechText;
}

/* gets the current date in datetime format, returns the formatted string 
*  @return - datetime formatted current time
**/
function getDateTime() {
  let d = new Date();
  let datetime = '';
  return datetime = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate() + ' ' +
                    d.getHours() + ':' + d.getMinutes() + ':' + d.getSeconds();
}

/* builds a sql insert statement from a variable length of parameters, returns sql string 
*  @param food - object with the food item and serving data we want to insert
*  @return - complete SQL string for inserting a food search result into DB
**/
function buildInsertStatement(food) {
  var fields = ['serving_amount','calcium','calories','carbohydrate','fat',
                'fiber','iron','monounsaturated_fat','polyunsaturated_fat',
                'potassium','protein','saturated_fat','sodium','sugar',
                'vitamin_a','vitamin_b','vitamin_c'];
  let head = `INSERT INTO favorites.Servings (food_id, date`;
  let body = `VALUES(${food.food_id}, "${getDateTime()}"`;
  for(var i = 0; i < fields.length; i++) {
    if(food.serving[fields[i]]) {
      head += `,${fields[i]}`;
      body += `,${food.serving[fields[i]]}`;
    }
  }
  head += ') ';
  body += ')';
  return head + body;
}

/* TODO - change to a merge instead of insert to do all in one check / insert 
* saves a food object to the database. First checks if item already exists
* @param food - object with food and serving data
* @return - result of sql insert
**/
async function saveSearchResult(food) {
  let results = null;
  let sql = `SELECT * FROM favorites.Foods WHERE food_id = ${food.food_id}`;
  try {
    results = await db.db_con.runQuery(sql);
    db.db_con.close();
  } catch(err) {
    console.log("ERROR with database query");
    console.log(err);
  }
  /* if food item does not exist create it in the Foods table */
  if(!results.length > 0) {
    sql = `INSERT INTO favorites.Foods (food_id, food_name, food_type) ` +
          `VALUES(${food.food_id}, "${food.name}", "${food.food_type}")`;
    try {
      results = await db.db_con.runQuery(sql);
      db.db_con.close();
    } catch(err) {
      console.log("ERROR with database query");
      console.log(err);
    }
    sql = buildInsertStatement(food);
    console.log("INSERTING SERVING INFO");
    console.log(sql);
    try {
      results = await db.db_con.runQuery(sql);
      db.db_con.close();
    } catch(err) {
      console.log("ERROR with database query");
      console.log(err);
    }
  }
  return results;
}

/* returns the gender of a value based on preconfigured values 
*  @param value - slot value to be compared against
*  @return - male if matched or female otherwise
**/
function getGender(value) {
  let m = ['he','boy','male','man'];
  for(let i = 0; i < m.length; i++) {
    if(m[i] === value) {
      return 'male';
    }
  }
  return 'female';
}

/* returns true if person age is valid otherwise false 
*  @param age - integer value to be validated
*  @return - true if valid, false otherwise
**/
function validAge(age) {
  if(age < 125 && age > 0) {
    return true;
  }
  return false;
}

/* creates and returns a speech string for the daily recommended intake for a given 
*  age and gender, data is retrieved from database
*  @param age - the integer value of a persons age
*  @param gender - string value either male or female
*  @return - the speechtext returned as a promise so function can be waited on
**/
async function createDailyIntakeResponse(age, gender) {
  let speechText = ''
  let results;
  try {
    results = await db.db_con.getDailyIntake(age,gender);
    db.db_con.close();
  } catch(err) {
    console.log(err);
  }
  speechText =  '' +
    `a ${gender} of ${age} years should eat ${results[0].vegetables} servings of vegetables ` +
    `and legumes, ${results[0].fruit} servings of fruit, ${results[0].grains} servings of grains ` +
    `and cereals ${results[0].meat} servings of lean meat, fish, eggs, nuts, seeds, legumes, ` +
    `beans and ${results[0].dairy} servings of milk, yoghurt, cheese and alternatives`;
  let attr = {lastDailyIntakeResponse: speechText}; 
  return new Promise(function (resolve, reject) {
    resolve(speechText);
  });
}

/* ------------------- Our alexa handlers for the different intents ---------------------- */
/* --------------------------------------------------------------------------------------- */

/* alexa entrypoint when app is launched, generate random welcome message and set and open 
*  all session variables 
**/
const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'LaunchRequest';
  },
  handle(handlerInput) {
    let session = handlerInput.attributesManager.getSessionAttributes();
    let speechText = getRandom(session.lastWelcomeResponse, [
      'Hi, I can calculate your body mass, register meals or search for nutrtion information.'
    ]);

    var DisplayText = "Getting Started: Say 'Check BMI', 'Check BMR', 'Register User', 'Tell me facts about Spaghetti'";
    /* formally declare and initialize our session variables */
    const attr = {
      lastFoodResult: null,
      lastFoodItemResponse: '',
      lastFoodItemPrompt: '',
      lastMoreInfoResponse: '',
      lastMoreInfoPrompt: '',
      lastRepeatResponse: '',
      lastHelpResponse : '',
      lastResponse: '',
      lastAgePrompt: '',
      lastGenderPrompt: '',
      lastDailyIntakeResponse: '',
      lastCancelResponse: '',
      lastStopResponse: '',
      lastNutrientPrompt: ''
    };

    imgAddress = "https://hercanberra.com.au/wp-content/uploads/2018/03/cheap-healthy-food-feature-565x376.jpg";

    if (supportsDisplay(handlerInput) ) {
      const myImage = new Alexa.ImageHelper()
        .addImageInstance(imgAddress)
        .getImage();
     
      const primaryText = new Alexa.RichTextContentHelper()
        .withTertiaryText(DisplayText)
        .getTextContent();
        
      handlerInput.responseBuilder.addRenderTemplateDirective({
        type: 'BodyTemplate2',
        token: 'string',
        backButton: 'HIDDEN',
        title: 'Nutrition Advice',
        image: myImage,
        textContent: primaryText
      });
  }

    handlerInput.attributesManager.setSessionAttributes(attr);
    return handlerInput.responseBuilder
      .speak(speechText)
      .withShouldEndSession(false)
      .getResponse();
  },
};

function httpGet(info) {
  request.post({ url: 'https://ka1901.scem.westernsydney.edu.au/api/alexa/public/api/userdata', form: info }, function (err, httpResponse, body) {
      if (err) { return console.log(err); }
      console.log(body);
  });
}


function httpGetUpdate(info) {
  console.log("come this area1");
  request.post({ url: `https://ka1901.scem.westernsydney.edu.au/api/alexa/public/api/userdata/${info.name}`, form: info }, function (err, httpResponse, body) {
      if (err) { return console.log(err); }
      console.log(body);
  });
}

/* Update user details */
const updateUserIntentHandler = { 
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'updateUserIntent';
  },
  async handle(handlerInput) {
    const session = handlerInput.attributesManager.getSessionAttributes();
    const currentIntent = handlerInput.requestEnvelope.request.intent;
    const request = handlerInput.requestEnvelope.request;
    let ageValue = isSlotValid(request, 'age');
    let genderValue = isSlotValid(request, 'gender');
    let nameValue = isSlotValid(request,'name');
    let weightValue = isSlotValid(request,'weight');
    let heightValue = isSlotValid(request,'height');
    let speechText = '';
    let attr;

    /* Firstly get name if not supplied already */
    if(!nameValue) {
      speechText = getRandom(session.lastNamePrompt, [
        'Awesome, Whats your first name?',
        'Cool, first name please.',
        'Can I get your first name?'
      ]);
      attr = {lastNamePrompt: speechText};
      addSessionValues(attr, handlerInput);
      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('name', currentIntent)
        .withShouldEndSession(false)
        .getResponse();
    }
    /* Get Gender of user */
    if(!genderValue) {
      speechText = getRandom(session.lastGenderPrompt, [
        'what is the gender of the person',
        'are we talking about a male or a female',
        'are you asking about a male or a female',
        'tell me if the person is a female or a male',
        'what gender is the person',
        'are they male or female'
      ]);
      attr = {lastGenderPrompt: speechText};
      addSessionValues(attr, handlerInput);
      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('gender', currentIntent)
        .withShouldEndSession(false)
        .getResponse();
    }
    genderValue = getGender(genderValue);

    /* Get Age of user */
    if(!ageValue) {
      speechText = getRandom(session.lastAgePrompt, [
        'Okay, How old are you?'
      ]);
      attr = {lastAgePrompt: speechText};
      addSessionValues(attr, handlerInput);
      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('age', currentIntent)
        .withShouldEndSession(false)
        .getResponse();
  }
    
    if(!weightValue) {
      speechText = getRandom(session.lastWeightPrompt, [
        'What is your weight in kilograms'
      ]);
      attr = {lastWeightPrompt: speechText};
      addSessionValues(attr, handlerInput);
      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('weight', currentIntent)
        .withShouldEndSession(false)
        .getResponse();
    }
    
    if(!heightValue) {
      speechText = getRandom(session.lastHeightPrompt, [
        'How tall are you in centimeters?'
      ]);
      attr = {lastHeightPrompt: speechText};
      addSessionValues(attr, handlerInput);
      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('height', currentIntent)
        .withShouldEndSession(false)
        .getResponse();
    }

    let name = currentIntent.slots['name'].value;
    let gender = genderValue;
    let age = currentIntent.slots['age'].value;;
    let weight = currentIntent.slots['weight'].value;
    let height = currentIntent.slots['height'].value;

    var info = {
      age: age,
      name: name,
      weight: weight,
      gender: gender,
      height: height
    };
    httpGetUpdate(info);

    /* we have all values, get daily intake for database build response and speak */
    try {
      speechText = 'Successfully updated your details!'
    } catch(err) {
      console.log(err);
    }
    return handlerInput.responseBuilder
      .speak(speechText)
      .withShouldEndSession(false)
      .getResponse();
  },
}

/* Intent to add a user */
const AddUserIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'AddUserIntent';
  },
  async handle(handlerInput) {
    const session = handlerInput.attributesManager.getSessionAttributes();
    const currentIntent = handlerInput.requestEnvelope.request.intent;
    const request = handlerInput.requestEnvelope.request;
    let ageValue = isSlotValid(request, 'age');
    let genderValue = isSlotValid(request, 'gender');
    let nameValue = isSlotValid(request,'name');
    let weightValue = isSlotValid(request,'weight');
    let heightValue = isSlotValid(request,'height');
    let speechText = '';
    let attr;

    /* Firstly get name */
    if(!nameValue) {
      speechText = getRandom(session.lastNamePrompt, [
        'Awesome, Whats your first name?',
        'Cool, first name please.',
        'Can I get your first name?'
      ]);
      attr = {lastNamePrompt: speechText};
      addSessionValues(attr, handlerInput);
      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('name', currentIntent)
        .withShouldEndSession(false)
        .getResponse();
    }
    /* Get Gender of user */
    if(!genderValue) {
      speechText = getRandom(session.lastGenderPrompt, [
        'what is the gender of the person',
        'are we talking about a male or a female',
        'are you asking about a male or a female',
        'tell me if the person is a female or a male',
        'what gender is the person',
        'are they male or female'
      ]);
      attr = {lastGenderPrompt: speechText};
      addSessionValues(attr, handlerInput);
      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('gender', currentIntent)
        .withShouldEndSession(false)
        .getResponse();
    }
    genderValue = getGender(genderValue);

    /* Get Age of user */
    if(!ageValue) {
      speechText = getRandom(session.lastAgePrompt, [
        'Okay, How old are you?'
      ]);
      attr = {lastAgePrompt: speechText};
      addSessionValues(attr, handlerInput);
      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('age', currentIntent)
        .withShouldEndSession(false)
        .getResponse();
  }
    
    if(!weightValue) {
      speechText = getRandom(session.lastWeightPrompt, [
        'What is your weight in kilograms'
      ]);
      attr = {lastWeightPrompt: speechText};
      addSessionValues(attr, handlerInput);
      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('weight', currentIntent)
        .withShouldEndSession(false)
        .getResponse();
    }
    
    if(!heightValue) {
      speechText = getRandom(session.lastHeightPrompt, [
        'How tall are you in centimeters?'
      ]);
      attr = {lastHeightPrompt: speechText};
      addSessionValues(attr, handlerInput);
      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('height', currentIntent)
        .withShouldEndSession(false)
        .getResponse();
    }

    let name = currentIntent.slots['name'].value;
    let gender = genderValue;
    let age = currentIntent.slots['age'].value;;
    let weight = currentIntent.slots['weight'].value;
    let height = currentIntent.slots['height'].value;

    var info = {
      age: age,
      name: name,
      weight: weight,
      gender: gender,
      height: height
    };
    httpGet(info);

    /* we have all values, get daily intake for database build response and speak */
    try {
      speechText = 'Adding user to database!'
    } catch(err) {
      console.log(err);
    }
    return handlerInput.responseBuilder
      .speak(speechText)
      .withShouldEndSession(false)
      .getResponse();
  },
};

/* BMI Calculator */
const BMIIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'BMIcalcIntent'
      && handlerInput.requestEnvelope.request !== 'COMPLETED';
  },
  async handle(handlerInput) {
    const session = handlerInput.attributesManager.getSessionAttributes();
    const currentIntent = handlerInput.requestEnvelope.request.intent;
    const request = handlerInput.requestEnvelope.request;
    let weightValue = isSlotValid(request,'weight');
    let heightValue = isSlotValid(request,'height');
    let speechText = '';
    let attr;
    
    /* Get Age of user */
    if(!weightValue) {
      speechText = getRandom(session.lastWeightPrompt, [
        'Okay great, to start off with: What is your weight in kilograms'
      ]);
      attr = {lastWeightPrompt: speechText};
      addSessionValues(attr, handlerInput);
      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('weight', currentIntent)
        .withShouldEndSession(false)
        .getResponse();
    }
    /* Get height of user */
    if(!heightValue) {
      speechText = getRandom(session.lastHeightPrompt, [
        'Great, How tall are you in centimeters?'
      ]);
      attr = {lastHeightPrompt: speechText};
      addSessionValues(attr, handlerInput);
      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('height', currentIntent)
        .withShouldEndSession(false)
        .getResponse();
    }

    let weight = currentIntent.slots['weight'].value;
    let height = currentIntent.slots['height'].value;
    
    imgAddress = "https://imageresizer.static9.net.au/G37JpddAed9elWExEVkGsB46900=/600x338/smart/http%3A%2F%2Fprod.static9.net.au%2F_%2Fmedia%2FNetwork%2FImages%2F2018%2F04%2F04%2F13%2F08%2F180404_coach_bmi.jpg";

try {
    const newHeight = height / 100;
    var bmi = weight / (newHeight * newHeight);
    const bmiRounded = Math.round(bmi * 10) / 10;
    let weightCategoryOutput = '';
    
    if(bmi < 18.5)
    {
        weightCategoryOutput = '. You are underweight.';
    }
    else if (bmi >= 18.5 && bmi <= 24.9)
    {
        weightCategoryOutput = '. You have a healthy weight.';
    }
    else if (bmi > 24.9 &&  bmi <= 29.9)
    {
        weightCategoryOutput = '. You are overweight.';
    }
    else if (bmi > 29.9 &&  bmi <= 34.9)
    {
        weightCategoryOutput = '. You are obese.';
    }
    else
    {
        weightCategoryOutput = '. You are extremely obese.';
    }
    speechText = 'Your BMI is ' + bmiRounded + weightCategoryOutput;
    } catch(err) {
      console.log(err);
    }

    if (supportsDisplay(handlerInput) ) {
      const myImage = new Alexa.ImageHelper()
        .addImageInstance(imgAddress)
        .getImage();
     
      const primaryText = new Alexa.RichTextContentHelper()
        .withSecondaryText(bmi)
        .getTextContent();
        
      handlerInput.responseBuilder.addRenderTemplateDirective({
        type: 'BodyTemplate7',
        token: 'string',
        backButton: 'HIDDEN',
        image: myImage,
        textContent: primaryText
      });
    }
    return handlerInput.responseBuilder
      .speak(speechText)
      .withShouldEndSession(false)
      .getResponse();
  },
}
/* BMR Calculator */
const BMRIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'BMRcalcIntent'
      && handlerInput.requestEnvelope.request !== 'COMPLETED';
  },
  async handle(handlerInput) {
    const session = handlerInput.attributesManager.getSessionAttributes();
    const currentIntent = handlerInput.requestEnvelope.request.intent;
    const request = handlerInput.requestEnvelope.request;
    let weightValue = isSlotValid(request,'weight');
    let heightValue = isSlotValid(request,'height');
    let ageValue = isSlotValid(request,'userage');
    let genderValue = isSlotValid(request,'gender');
    let speechText = '';
    let attr;

    /* Get Age of user */
    if(!weightValue) {
      speechText = getRandom(session.lastWeightPrompt, [
        'Okay great, to start off with: What is your weight in kilograms'
      ]);
      attr = {lastWeightPrompt: speechText};
      addSessionValues(attr, handlerInput);
      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('weight', currentIntent)
        .withShouldEndSession(false)
        .getResponse();
    }
    /* Get height of user */
    if(!heightValue) {
      speechText = getRandom(session.lastHeightPrompt, [
        'Awesome, How tall are you in centimeters?'
      ]);
      attr = {lastHeightPrompt: speechText};
      addSessionValues(attr, handlerInput);
      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('height', currentIntent)
        .withShouldEndSession(false)
        .getResponse();
    }
    /* Get gender of user */
    if(!genderValue) {
      speechText = getRandom(session.lastGenderPrompt, [
        'Okay, What is your gender?'
      ]);
      attr = {lastGenderPrompt: speechText};
      addSessionValues(attr, handlerInput);
      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('gender', currentIntent)
        .withShouldEndSession(false)
        .getResponse();
    }
    genderValue = getGender(genderValue);

        /* Get age of user */
    if(!ageValue) {
        speechText = getRandom(session.lastAgePrompt, [
          'Okay, How old are you?',
          'what age is the person',
          'how old is the person',
          'what age person are we talking about',
          'tell me how old the person is',
          'can you tell me how old the person is',
          'what is the age of the person',
          'what age are we talking about'
        ]);
        attr = {lastAgePrompt: speechText};
        addSessionValues(attr, handlerInput);
        return handlerInput.responseBuilder
          .speak(speechText)
          .addElicitSlotDirective('userage', currentIntent)
          .withShouldEndSession(false)
          .getResponse();
    }

    let weight = currentIntent.slots['weight'].value;
    let height = currentIntent.slots['height'].value;
    let age = currentIntent.slots['userage'].value;
    let gender = genderValue;

    imgAddress = "https://images-na.ssl-images-amazon.com/images/I/51UoIzk274L.png";

    
try {
    var bmr;
    var calc = (10 * weight) + (6.25 * height) - (5 * age);
      
    if(gender == "male")
    {
      bmr = calc + 5;
    }
    else if(gender == "female")
    {
      bmr = calc - 161;
    }
    speechText = 'Your BMR is ' + bmr + ' kilocalories';
    } catch(err) {
      console.log(err);
    }


    if (supportsDisplay(handlerInput) ) {
      const myImage = new Alexa.ImageHelper()
        .addImageInstance(imgAddress)
        .getImage();
     
      const primaryText = new Alexa.RichTextContentHelper()
        .withSecondaryText(speechText)
        .getTextContent();
        
      handlerInput.responseBuilder.addRenderTemplateDirective({
        type: 'BodyTemplate2',
        token: 'string',
        backButton: 'HIDDEN',
        image: myImage,
        textContent: primaryText
      });
  }

    return handlerInput.responseBuilder
      .speak(speechText)
      .withShouldEndSession(false)
      .getResponse();
  },
}

const RegisterFoodIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'RegisterFoodIntent'
      && handlerInput.requestEnvelope.request !== 'COMPLETED';
  },
  async handle(handlerInput) {
    const session = handlerInput.attributesManager.getSessionAttributes();
    const currentIntent = handlerInput.requestEnvelope.request.intent;
    const request = handlerInput.requestEnvelope.request;
    let UserValue = isSlotValid(request, 'User');
    let FoodValue = isSlotValid(request, 'Food');
    let FirstIngredient = isSlotValid(request, 'Ingredient');
    let NextIngredient = isSlotValid(request, 'NextIngredient');
    let speechText = '';
    let attr;
    /* Get name of user */
    if(!UserValue) {
      speechText = getRandom(session.lastUserPrompt, [
        'Hi, Who am I speaking to?',
        'Hey, Can I get your name please?',
        'Hi there, What is your name please?',
        'Sure thing, Let me first get your name',
        'Awesome, let me first get your name',
        'Please state your first name'
      ]);
      attr = {lastUserPrompt: speechText};
      addSessionValues(attr, handlerInput);
      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('User', currentIntent)
        .withShouldEndSession(false)
        .getResponse();
    }
    /* Get Food of user */
    if(!FoodValue) {
      speechText = getRandom(session.lastFoodPrompt, [
        'What meal would you like to register?',
        'What is the name of the food?',
        'Sure, what is the name of the food you ate?',
        'Let me just get the name of the food please.',
        'Go ahead and tell me the food name please.'
      ]);
      attr = {lastFoodPrompt: speechText};
      addSessionValues(attr, handlerInput);
      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('Food', currentIntent)
        .withShouldEndSession(false)
        .getResponse();

    } 
       /* Get Ingredients of food */
       if(!FirstIngredient) {
        speechText = getRandom(session.firstIngredientPrompt, [
          'Lets start with the first ingredient',
          'Okay, what was the first ingredient?',
          'First ingredient?'
        ]);
        attr = {firstIngredientPrompt: speechText};
        addSessionValues(attr, handlerInput);
        return handlerInput.responseBuilder
          .speak(speechText)
          .addElicitSlotDirective('Ingredient', currentIntent)
          .withShouldEndSession(false)
          .getResponse();
      }
   // var lastIngredient 
    if(!NextIngredient){
      speechText = getRandom(session.NextIngredientPrompt, [
        'Awesome, Anything else?',
        'Cool, Is that everything?',
        'Sounds good, anything else to add?',
        'Anything else?',
        'Great, anything else in there?'
      ]);
      attr = {NextIngredientPrompt: speechText};
      addSessionValues(attr, handlerInput);
      return handlerInput.responseBuilder
          .speak(speechText)
          .addElicitSlotDirective('NextIngredient', currentIntent)
          .withShouldEndSession(false)
          .getResponse();
    
    }
  //  if (NextIngredient === 'Yes'){lastIngredient};
    try {
      speechText = 'Registering food!'
    } catch(err) {
      console.log(err);
    }
    return handlerInput.responseBuilder
      .speak(speechText)
      .withShouldEndSession(false)
      .getResponse();
  },
}

/* food item search intent handler, validates whether or not the food slot 
*  is filled and then calls a function to search the fat secret database
**/
const FoodSearchIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'FoodSearchIntent'
      && handlerInput.requestEnvelope.request !== 'COMPLETED';
  },
  async handle(handlerInput) {
    const currentIntent = handlerInput.requestEnvelope.request.intent;
    const request = handlerInput.requestEnvelope.request;
    const weightValue = isSlotValid(request, 'weight')
    let attributeValue = isSlotValid(request, 'attribute');
    const session = handlerInput.attributesManager.getSessionAttributes();
    let speechText, attr, results;
    /* set serving size to default 100 grams if not set */
    if(request.dialogState === 'STARTED') {
      if(!weightValue) {
        currentIntent.slots['weight'].value = "100";
      }
      if(attributeValue) {
        attributeValue = attributeValue.replace(" ", "_").trim();
      }
    }
    /* if no food value is set */
    if(!currentIntent.slots['food'].value) {
      speechText = getRandom(session.lastFoodItemPrompt, [
        'What food item would you like me to search for?',
        'Can you tell me the name of the food item you want searched for?',
        'Tell me the name if the food item you want searched for',
        'What was the food item you want searched for?',
        'I need the name of a food item to search for',
        'I missed the name of the food item, please say again'
      ]);
      attr = {lastFoodItemPrompt: speechText}
      addSessionValues(attr, handlerInput);
      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('food', currentIntent)
        .withShouldEndSession(false)
        .getResponse();
    } 
    /* we have a food item value, now search fat secret db and build speech response */
    results = await searchFoodItem(currentIntent.slots['food'].value);
    results = normalizeWeights(currentIntent.slots['weight'].value, results);
    speechText = buildFoodSearchResponse(results, handlerInput, attributeValue);
    attr = { 
      lastFoodItemResponse: speechText,
      lastFoodResult: results
    };

    //var imgAddress = "https://ka1901.scem.westernsydney.edu.au/userpage.php?query=Alex#_ABSTRACT_RENDERER_ID_1"
    var imgAddress = "https://chart.googleapis.com/chart?chco=083D77|DA4167|2E4057|F6D8AE&chs=450x300&chf=bg,s,65432100&chd=t:";
    imgAddress += proteinatt;
    imgAddress += ",";
    imgAddress += fatatt;
    imgAddress += ","
    imgAddress += sugaratt;
    imgAddress += ","
    imgAddress += carbatt;
    imgAddress += "&cht=p&chl=Protein|Fat|Sugar|Carbs";


/*
var imgAddress = "https://ka1901.scem.westernsydney.edu.au/PieGenerator.php?protein=";
    imgAddress += proteinatt;
    imgAddress += "&fat=";
    imgAddress += fatatt;
    imgAddress += "&sugar="
    imgAddress += sugaratt;
    imgAddress += "&carbs="
    imgAddress += carbatt;
    */
  //var nextline = " Grams";

  var Displaytext = "Protein: " + proteinatt + "\nFat: " + fatatt +  "Sugar: " + sugaratt + "Carbs: " + carbatt;
  //var testing = "test";

    if (supportsDisplay(handlerInput) ) {
      const myImage = new Alexa.ImageHelper()
        .addImageInstance(imgAddress)
        .getImage();
     
      /*const primaryText = new Alexa.RichTextContentHelper()
        .withTertiaryText(Displaytext)
        .getTextContent();*/
        
      handlerInput.responseBuilder.addRenderTemplateDirective({
        type: 'ListTemplate1',
        token: 'string',
        backButton: 'HIDDEN',
        image: myImage,
        title: `${results.name}`,
        listItems:[
          {
            token: 'item_1',
            textContent:{
              primaryText:{
                type:'RichText',
                text:'<font size="5">Protein</font>'
              },
              secondaryText: {
                type: "PlainText",
                text: "Serving Size: 100grams"
              },
              tertiaryText: {
                type: "PlainText",
                text: proteinatt + ' Grams'
            }
          }
          },
          {
            token: 'item_2',
            textContent:{
              primaryText:{
                type:'RichText',
                text:'<font size="5">Fat</font>'
              },
              secondaryText: {
                type: "PlainText",
                text: "Serving Size: 100grams"
              },
              tertiaryText: {
                type: "PlainText",
                text: fatatt + ' Grams'
              }
            }
          },
          {
            token: 'item_3',
            textContent:{
              primaryText:{
                type:'RichText',
                text:'<font size="5">Sugar</font>'
              },
              secondaryText: {
                type: "PlainText",
                text: "Serving Size: 100grams"
              },
              tertiaryText: {
                type: "PlainText",
                text:  sugaratt + ' Grams'
              }
            }
          },
          {
            token: 'item_4',
            textContent:{
              primaryText:{
                type:'RichText',
                text:'<font size="5">Carbs</font>' 
              },
              secondaryText: {
                type: "PlainText",
                text: "Serving Size: 100grams"
              },
              tertiaryText: {
                type: "PlainText",
                text: carbatt + ' Grams'
              }
            }
          }
        ]
      });
  }

    addSessionValues(attr, handlerInput);
    try {
      saveSearchResult(results);
    } catch(err) {
      console.log(err);
    }
    return handlerInput.responseBuilder
      .speak(speechText)
      .withSimpleCard('food item request match found')
      .withShouldEndSession(false)
      .getResponse();
  },
};

/* intent that allows a user to query nutrient content of a previous food search */
const MoreInformationIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'MoreInformationIntent';
  },
  handle(handlerInput) {
    const session = handlerInput.attributesManager.getSessionAttributes();
    const slotValue = isSlotValid(handlerInput.requestEnvelope.request, "attribute");
    let speechText = '';
    let attr;

    if(session.lastFoodResult !== null) {
      if(slotValue) {
        speechText = buildMoreInfoResponse(session, slotValue, handlerInput);
        attr = {lastMoreInfoResponse: speechText};
        addSessionValues(attr, handlerInput);
        return handlerInput.responseBuilder
          .speak(speechText)
          .withSimpleCard('More information intent', speechText)
          .withShouldEndSession(false)
          .getResponse();
  
      } else if(!slotValue) {
        speechText = getRandom(session.lastMoreInfoResponse, [
          'Please repeat the name of the food nutrient you want to know about',
          'Please say the name of the food attribute you want information on',
          'Can you repeat the name of the attribute again',
          'I did not hear the food attribute correctly, please repeat'
        ]);
        attr = {lastMoreInfoResponse: speechText};
        addSessionValues(attr, handlerInput);
        return handlerInput.responseBuilder
          .speak(speechText)
          .addElicitSlotDirective('attribute')
          .withSimpleCard('More information intent', speechText)
          .withShouldEndSession(false)
          .getResponse();
      }
    }
    speechText = 'You need to search for a food item first';
    return handlerInput.responseBuilder
      .speak(speechText)
      .withSimpleCard('More information intent', speechText)
      .withShouldEndSession(false)
      .getResponse();
  },
};

/* intent that triggers a API call to the kiosk server to enable the food scanner 
*  requires validation for pin and username.
**/
const KioskScanIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'KioskScan'
      && handlerInput.requestEnvelope.request.dialogState !== 'COMPLETED';
  },
  async handle(handlerInput) {
    let currentIntent = handlerInput.requestEnvelope.request.intent;
    let results, pin, speechText;
    let pinConfirmed = currentIntent.slots['pin'].confirmationStatus;
    let unameConfirm = currentIntent.slots['username'].confirmationStatus;

    /* if our pin is correct but our username is confirmed as incorrect it is a system error */
    if(unameConfirm === 'DENIED' && pinConfirmed === 'CONFIRMED') {
      speechText = 'Your pin is not linked to your user name correctly, please create a new pin \
                    via the mobile app';
      return handlerInput.responseBuilder
        .speak(speechText)
        .withShouldEndSession(false)
        .getResponse();

    /* if we have no pin and no username confirmation yet */
    } else if(!currentIntent.slots["pin"].value || pinConfirmed === 'DENIED') {
      console.log('PIN BEING ASKED FOR');
      currentIntent.slots['username'].confirmationStatus = 'NONE';
      if(currentIntent.slots['username'].value) {
        currentIntent.slots['username'].value = null;
      }
      currentIntent.slots['pin'].confirmationStatus = 'NONE';
      console.log(currentIntent);
      return handlerInput.responseBuilder
        .speak('what is your pin number')
        .addElicitSlotDirective('pin', currentIntent)
        .withShouldEndSession(false)
        .getResponse();

    /* if we have a pin and and no username confirmation */
    } else if(currentIntent.slots["pin"].value && unameConfirm === 'NONE') {
      pin = currentIntent.slots["pin"].value;
      try {
        results = await apiRequest.handler.checkUserPin(pin)
      } catch(err) {
        console.log('ERROR REQUESTING PIN CHECK');
        console.log(err);
      }
      results = JSON.parse(results);
      currentIntent.slots['username'].value = results.uname;

      /* if no username is returned from pin check */
      if(parseInt(results.uname) === 0) {
        currentIntent.slots['username'].value = null;
        currentIntent.slots['username'].confirmationStatus = 'NONE';
        currentIntent.slots['pin'].value = null;
        currentIntent.slots['pin'].confirmationStatus = 'NONE';
        return handlerInput.responseBuilder
          .speak('no username found, what is your pin number again?')
          .addElicitSlotDirective('pin', currentIntent)
          .withShouldEndSession(false)
          .getResponse();
      }
      /* else we have a username and we confirm it with user */
      return handlerInput.responseBuilder
        .speak('is your username ' + results.uname + '?')
        .addConfirmSlotDirective('username', currentIntent)
        .withShouldEndSession(false)
        .getResponse();

    /* if username is incorrect confirm whether pin number is correct */
    } else if(pinConfirmed === 'NONE' && unameConfirm === 'DENIED') {
      console.log('USERNAME BEING RESET AFTER DENIED');
      pin = currentIntent.slots["pin"].value.split('').join(' ');
      
      return handlerInput.responseBuilder
        .speak('Is the pin number ' + pin + ' correct?')
        .addConfirmSlotDirective('pin', currentIntent)
        .withShouldEndSession(false)
        .getResponse();

    /* if our username is confirmed we can call the kiosk scan API method */
    } else if(unameConfirm === 'CONFIRMED') {
      try {
        results = await requestKioskScan('evrenb21', pin);
      } catch(err) {
        console.log('kiosk scan error');
        console.log(err);
        speechText = 'the kiosk scanner is currently unavailable';
        return handlerInput.responseBuilder
          .speak(speechText)
          .getResponse();
      }
      speechText = 'Food succesfully scanned, thank you';
      return handlerInput.responseBuilder
        .speak(speechText)
        .withShouldEndSession(false)
        .getResponse();
    }
  },
};

/* intent that allows the user to ask about the recommended daily intake for a given
*  age and gender. Utterances can trigger without the age and gender being given so
*  we need to validate each before building response 
**/
const DailyNutrientIntakeIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'DailyNutrientIntake';
  },
  async handle(handlerInput) {
    const session = handlerInput.attributesManager.getSessionAttributes();
    const currentIntent = handlerInput.requestEnvelope.request.intent;
    const request = handlerInput.requestEnvelope.request;
    let ageValue = isSlotValid(request, 'age');
    let genderValue = isSlotValid(request, 'gender');
    let speechText = '';
    let attr;
    /* if we dont have a value for the gender value yet */
    if(!genderValue) {
      speechText = getRandom(session.lastGenderPrompt, [
        'what is the gender of the person',
        'are we talking about a male or a female',
        'are you asking about a male or a female',
        'tell me if the person is a female or a male',
        'what gender is the person',
        'are they male or female'
      ]);
      attr = {lastGenderPrompt: speechText};
      addSessionValues(attr, handlerInput);
      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('gender', currentIntent)
        .withShouldEndSession(false)
        .getResponse();
    }
    genderValue = getGender(genderValue);

    /* if we dont have a value for the age slot yet */
    if(!ageValue) {
      speechText = getRandom(session.lastAgePrompt, [
        'what age is the person',
        'how old is the person',
        'what age person are we talking about',
        'tell me how old the person is',
        'can you tell me how old the person is',
        'what is the age of the person',
        'what age are we talking about'
      ]);
      attr = {lastAgePrompt: speechText};
      addSessionValues(attr, handlerInput);

      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('age', currentIntent)
        .withShouldEndSession(false)
        .getResponse();

    } else {
      /* check that our age is within valid range */
      if(!validAge(ageValue)) {
        speechText = getRandom(session.lastAgePrompt, [
          `${ageValue} is not a valid, repeat the age again please`,
          `${ageValue} is invalid, tell me the age again`
        ]);
        attr = {lastAgePrompt: speechText};
        addSessionValues(attr, handlerInput);
  
        return handlerInput.responseBuilder
          .speak(speechText)
          .addElicitSlotDirective('age', currentIntent)
          .withShouldEndSession(false)
          .getResponse();
      }
    }
    /* we have all values, get daily intake for database build response and speak */
    try {
      speechText = await createDailyIntakeResponse(ageValue, genderValue, session);
    } catch(err) {
      console.log(err);
    }
    return handlerInput.responseBuilder
      .speak(speechText)
      .withShouldEndSession(false)
      .getResponse();
  },
};

/* simple intent that allows user to ask what is a given food nutrient, information is 
*  stored in a database, could be extended in future to provide either more information
**/
const NutrientWhatIsHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'NutrientWhatIsIntent';
  },
  async handle(handlerInput) {
    const session = handlerInput.attributesManager.getSessionAttributes();
    const currentIntent = handlerInput.requestEnvelope.request.intent;
    const request = handlerInput.requestEnvelope.request;
    let nutValue = isSlotValid(request, 'nutrient');
    let speechText = '';
    let attr;

    if(!nutValue) {
      speechText = getRandom(session.lastNutrientPrompt, [
        `what nutrient do you want to know about`,
        `tell me the name of food nutrient`,
        `Can you give me the name of a food nutrient`,
        `what food nutrient are you asking about`
      ]);
      attr = {lastNutrientPrompt: speechText};
      addSessionValues(attr, handlerInput);
      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('nutrient', currentIntent)
        .withShouldEndSession(false)
        .getResponse();
    }
    try {
      results = await db.db_con.getNutrientInfo(nutValue, 'description');
      db.db_con.close();
    } catch(err) {
      console.log('ERROR WITH NUTRITION DB CALL')
      console.log(err);
    }
    speechText = results[0].description;
    return handlerInput.responseBuilder
      .speak(speechText)
      .withShouldEndSession(false)
      .getResponse();
  },
};

/* simple intent that allows a user to ask what the best sources of a given food 
*  nutrient are. As with the above could be extended in future, data is stored in
*  database
**/
const NutrientWhereIsHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'NutrientWhereIsIntent';
  },
  async handle(handlerInput) {
    const session = handlerInput.attributesManager.getSessionAttributes();
    const currentIntent = handlerInput.requestEnvelope.request.intent;
    const request = handlerInput.requestEnvelope.request;
    let nutValue = isSlotValid(request, 'nutrient');
    let speechText = '';
    let results;
    let attr;

    if(!nutValue) {
      speechText = getRandom(session.lastNutrientPrompt, [
        `what nutrient do you want to know about`,
        `tell me the name of food nutrient`,
        `Can you give me the name of a food nutrient`,
        `what food nutrient are you asking about`
      ]);
      attr = {lastNutrientPrompt: speechText};
      addSessionValues(attr, handlerInput);

      return handlerInput.responseBuilder
        .speak(speechText)
        .addElicitSlotDirective('nutrient', currentIntent)
        .withShouldEndSession(false)
        .getResponse();
    }
    try {
      results = await db.db_con.getNutrientInfo(nutValue, 'sources');
      db.db_con.close();
    } catch(err) {
      console.log('ERROR WITH NUTRITION DB CALL')
      console.log(err);
    }
    speechText = results[0].sources;
    return handlerInput.responseBuilder
      .speak(speechText)
      .withShouldEndSession(false)
      .getResponse();
  },
};

/* custom help intent that allows a user to ask for help with a given area of the app
*  and to recieve info on how to interact with it
**/
const HelpIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'HelpIntent';
  },
  handle(handlerInput) {
    const intentRequest = handlerInput.requestEnvelope.request;
    const updatedIntent = handlerInput.requestEnvelope.request.intent;
    const slotValue = isSlotValid(intentRequest, "help");
    let speechText;
    
    /* check what last reponse was so no repeat, then generate random response */
    if (intentRequest.dialogState === "STARTED"){
      if(slotValue === false){
        return handlerInput.responseBuilder
          .addDelegateDirective(updatedIntent)
          .getResponse();     
        } else{
          return handlerInput.responseBuilder
            .addDelegateDirective()
            .getResponse(); 
        }               
    } else if (intentRequest.dialogState != "COMPLETED") {
      return handlerInput.responseBuilder
        .addDelegateDirective()
        .getResponse(); 
  
    } else {
      switch(slotValue){
        case "search":
        case "searching":
          speechText = '' +
            '<speak>To search for food, you can simply say “Alexa, can you search for Beef for me?”. You ' +
            'can replace “Beef” with essentially whatever you want <break time="20ms"/> like “Chicken Breast”' +
            ' or “Filet Mingnon”. You can also specify the weight for the food you want to search for.     ' + 
            '<break time="1s"/>You could also search for nutrition information, like “what is Protein” for '+
            'example. If you have any more questions not answered here, please consult the mobile app. </speak>';
          break;
        case "kiosk":
          speechText = '' +
            '<speak> If you are using the kiosk to scan your food, just simply tell us, “Scan the food”, I ' +
            'will ask you for you Username and Pin <break time="5ms"/> and let you know when the scan is ' +
            'done. The scan results can be accessed on the mobile app. If you don’t have an account with ' + 
            'us, or have forgotten your pin, please use the mobile app on your phone to register or get a new pin</speak>';
          break;
        case "application":
          speechText = '' +
            '<speak>I can do many things for you: You can ask it to “Search for beef” and I can return with ' +
            'some basic nutritional information of that item. You can also ask for a specific attribute like,' +
            ' “what is the protein in that?” or “What is the protein value in Beef?” If you are talking to me ' + 
            'from a kiosk, you can put your food in and ask me to “Scan the food”, if you have your Username ' + 
            'and Pin the kiosk can scan your food. Psst. If you don’t have an account with us, or need your ' +
            'pin, you can use the mobile phone app to do that.  </speak>';
          break;
        case "nutrition":
          speechText = '<speak>I can give you dietary guidelines if you like, just ask me what the recommended ' +
            'daily intake for a person is. You can also ask me about a particular food nutrient, for example just ' +
            'ask me what is protein, or ask me where can I find protein</speak>';  
          break;
        default:
          speechText = '' +
            '<speak>I can\'t help you with that unfortunately, please consult our mobile application if you ' + 
            'have an issue with our alexa app. For another other issues with alexa, please visit the help ' + 
            'pages on the Amazon web site.</speak>';
      }
      return handlerInput.responseBuilder
        .speak(speechText)
        .withShouldEndSession(false)
        .getResponse();
    }
  },
};

/* basic app stop handler with randomized output */
const StopIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.StopIntent';
  },
  handle(handlerInput) {
    const session = handlerInput.attributesManager.getSessionAttributes();
    const speechText = getRandom(session.lastHelpResponse, [
      'Thank you for using the nutrition monitoring system',
      'Ok, stopping now',
      'Closing the nutrition monitoring system',
      'Shutting down the nutrition monitoring system',
      'Ending now',
      'Finshing now',
      'Goodbye and thank you for using the nutrition monitoring system',
      'Goodbye'
    ]);
    const attr = { lastStopResponse : speechText};
    addSessionValues(attr, handlerInput);
    return handlerInput.responseBuilder
      .speak(speechText)
      .withSimpleCard('Stop intent', speechText)
      .getResponse();
  },
};

/* standard cancel intent, only added randomized speech and a do not end session directive */
const CancelIntentHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'IntentRequest'
      && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.CancelIntent';
  },
  handle(handlerInput) {
    const session = handlerInput.attributesManager.getSessionAttributes();
    const speechText = getRandom(session, [
      'Ok then',
      'Ok, canceling now',
      'Request canceled',
      'Canceling',
      'Canceled'
    ]);
    const attr = { lastCancelResponse : speechText};
    addSessionValues(attr, handlerInput);
    return handlerInput.responseBuilder
      .speak(speechText)
      .withSimpleCard('Cancel intent', speechText)
      .withShouldEndSession(false)
      .getResponse();
  },
};

/* standard, not used unless something goes wrong with alexa service / lambda function */
const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return handlerInput.requestEnvelope.request.type === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    console.log(`Session ended with reason: ${handlerInput.requestEnvelope.request.reason}`);
    return handlerInput.responseBuilder.getResponse();
  },
};

/* standard alexa error intent handler */
const ErrorHandler = {
  canHandle() {
    return true;
  },
  handle(handlerInput, error) {
    console.log(`Error handled: ${error.message}`);
    return handlerInput.responseBuilder
      .speak('Sorry, I can\'t understand the command. Please say again.')
      .reprompt('Sorry, I can\'t understand the command. Please say again.')
      .getResponse();
  },
};


function supportsDisplay(handlerInput) {
  var hasDisplay =
    handlerInput.requestEnvelope.context &&
    handlerInput.requestEnvelope.context.System &&
    handlerInput.requestEnvelope.context.System.device &&
    handlerInput.requestEnvelope.context.System.device.supportedInterfaces &&
    handlerInput.requestEnvelope.context.System.device.supportedInterfaces.Display
  return hasDisplay;

}


/* the lambda function entrypoint, this is where everything is assigned and actually run */
const skillBuilder = Alexa.SkillBuilders.custom();

exports.handler = skillBuilder
  .addRequestHandlers(
    /* our custom built intent handlers */
    FoodSearchIntentHandler,
    KioskScanIntentHandler,
    RegisterFoodIntentHandler,
    MoreInformationIntentHandler,
    HelpIntentHandler,
    DailyNutrientIntakeIntentHandler,
    AddUserIntentHandler,
    BMIIntentHandler,
    NutrientWhatIsHandler,
    NutrientWhereIsHandler,
    BMRIntentHandler,
    updateUserIntentHandler,
    /*standard handlers */
    LaunchRequestHandler,  
    CancelIntentHandler,
    StopIntentHandler,
    SessionEndedRequestHandler
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
