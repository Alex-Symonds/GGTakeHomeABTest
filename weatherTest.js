/*
    Creates an A/B test weather component and injects it onto a page on 
    the National Trust website.

    Assumptions/Context:
    * The goal is increased visitor count at the physical location. There's no 
      online booking, so this must be counted at the door

    * Since we can't link real-life visitors to website users, we will put 
      locations (and, therefore, location webpages) into A and B buckets: some 
      pages will always show the weather, others won't

    * User behaviour that could be of interest:
      >> Whether the user clicked to open the weather forecast at all
      >> When the user closed it (to eliminate accidental opening)
      >> When the user opened it (in case we want to see if the content of the 
         weather forecast made a difference)
    
    * Users who rejected cookies will still see the weather forecast. We won't 
      know the proportion of them who opened the forecast, but it's probably 
      going to be roughly the same proportion as those who accepted cookies 
      (unless we suspect a link between attitudes to cookies and weather 
      forecasts)

    * I'm assuming that we can't "share" the existing user ID, session 
      ID and activity map cookies because they're from another domain, 
      so they won't be in the header when our script is requested
      >> If that's incorrect, here are some cookies we could share:
        QuantumMetricUserID
        QuantumMetricSessionID
        s_sq (<- activity map)
    
    Contents:
        || main
        || Cookie helpers
        || Run AB test
        || Setup AB test monitoring
        || Main function to build and inject component
        || Get the latitude and longitude
        || Use lat and lon to get weather data
        || Create the weather element via cloning
        || Inject the weather element
        || Utility functions
*/


// || main
document.addEventListener('DOMContentLoaded', () => {
    // Using the URL to ID the page so that pages in the test group can be IDed even if the user rejected all cookies
    const PAGES_IN_TEST = [
        'https://www.nationaltrust.org.uk/visit/warwickshire/packwood-house',
    ];
    const AB_TEST_ID = "UID_forThisTest";
    const TEST_EXPIRES = "Fri, 31 Dec 2024 00:00:01 GMT";

    abTestMain(AB_TEST_ID, PAGES_IN_TEST, TEST_EXPIRES);
});


// || Cookie helpers
const cookieManager = {
    havePermission(){
        const cookiePrefs = cookieManager.getValue('cookiePreferences');
        return cookiePrefs.indexOf('analytics%3Dtrue') !== -1;
    },
    exists(cookieName){
        return document.cookie
            .split(";")
            .some((item) => item.trim().startsWith(`${cookieName}=`))
    },
    getValue(cookieName){ 
        return cookieManager.exists(cookieName)
        ? document.cookie
            .split("; ")
            .find((row) => row.startsWith(`${cookieName}=`))
            ?.split("=")[1]
        : null;
    },
    create(cookieName, cookieValue, expires = ""){
        const expiresParam = expires === ""
            ? ""
            : `;expires=${expires}`
        ;

        document.cookie = `${cookieName}=${cookieValue}${expiresParam}; Secure`;
    },
    append(cookieName, addToValue, expires = ""){
        if(cookieManager.exists(cookieName)){
            const prevValue = cookieManager.getValue(cookieName);
            document.cookie = `${cookieName}=${prevValue},${addToValue}`;
        }
        else{
            cookieManager.create(cookieName, addToValue, expires);
        }
    },
    hasValue(cookieName, cookieValue){
        return document.cookie.split(";").some((item) => item.includes(`${cookieName}=${cookieValue}`))
    }
}


// || Run AB test
async function abTestMain(AB_TEST_ID, PAGES_IN_TEST, TEST_EXPIRES){

    if(pageIsBeingTested()){
        const componentMounted = await injectWeatherComponent();
        if(componentMounted && cookieManager.havePermission()){
            setIdCookies(TEST_EXPIRES);
            monitorWeatherTest(AB_TEST_ID, TEST_EXPIRES);
        }
    }
    return;


    function pageIsBeingTested(){
        const currentURL = window.location.href;
        for(let i = 0; i < PAGES_IN_TEST.length; i++){
            if(currentURL === PAGES_IN_TEST[i]){
                return true;
            }
        }  
        return false;
    }


    function setIdCookies(TEST_EXPIRES){
        const COOKIE_USERID = 'abTestUserId';
        const COOKIE_SESSIONID = 'abTestSessionId';

        if(!cookieManager.exists(COOKIE_USERID)){
            cookieManager.create(COOKIE_USERID, generateUUID(), TEST_EXPIRES);
        }

        if(!cookieManager.exists(COOKIE_SESSIONID)){
            cookieManager.create(COOKIE_SESSIONID, generateUUID(), );
        }
    }

    // https://stackoverflow.com/questions/105034/how-do-i-create-a-guid-uuid/8809472#8809472
    function generateUUID() { // Public Domain/MIT
        var d = new Date().getTime();//Timestamp
        var d2 = ((typeof performance !== 'undefined') && performance.now && (performance.now()*1000)) || 0;//Time in microseconds since page-load or 0 if unsupported
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16;//random number between 0 and 16
            if(d > 0){//Use timestamp until depleted
                r = (d + r)%16 | 0;
                d = Math.floor(d/16);
            } else {//Use microseconds since page-load if supported
                r = (d2 + r)%16 | 0;
                d2 = Math.floor(d2/16);
            }
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

}


// || Setup AB test monitoring
function monitorWeatherTest(testID, TEST_EXPIRES){
    // Monitor interest in the added weather forecast
    document.body.addEventListener("click", (e) => {
        const relevantElement = e.target?.closest('[data-abtestid]');
        if(relevantElement === null){
            return;
        }
        updateTestMonitoringCookie(Date.now(), relevantElement.dataset.abtestid);
    });

    function updateTestMonitoringCookie(timestamp, idStr){
        const COOKIE = `abTestMonitor${testID}`;
        debounce( cookieManager.append(COOKIE, `${timestamp}_${idStr}`, TEST_EXPIRES), 250);
    }

    // https://stackoverflow.com/questions/75988682/debounce-in-javascript
    const debounce = (callback, wait) => {
        let timeoutId = null;
        return (...args) => {
          window.clearTimeout(timeoutId);
          timeoutId = window.setTimeout(() => {
            callback(...args);
          }, wait);
        };
      }
}



// || Main function to build and inject component, then report success or failure
async function injectWeatherComponent(){
    const latAndLon = getLatAndLonFromPage();
    if(latAndLon === null || !('lat' in latAndLon) || !('lon' in latAndLon)){
        return false;
    }

    try{
        const weatherData = await getWeatherData(latAndLon);
        const weatherSection = createWeatherSection(weatherData);
        addWeatherSectionToPage(weatherSection);
    }
    catch(error){
        return false;
    }

    return true;
}


// || Get the latitude and longitude
function getLatAndLonFromPage(){
    const eleWithData = findGoogleMapsImageElement();
    if(eleWithData === null){
        return null;
    }
    return extractLatAndLonFromGoogleMapsURL(eleWithData.href);

    function extractLatAndLonFromGoogleMapsURL(urlStr){
        const destinationStr = extractValueFromUrl(urlStr, 'destination');
        if(destinationStr === ""){
            return null;
        }

        const latAndLon = destinationStr.split("%2C");
        if(latAndLon.length !== 2){
            return null;
        }
        return { 
            lat: latAndLon[0], 
            lon: latAndLon[1]
        }
    }

    function findGoogleMapsImageElement(){
        const ID_GOOGLEMAPS = "propertyViewOnGoogleMaps_image";
        return document.getElementById(ID_GOOGLEMAPS);
    } 
}


// || Use lat and lon to get weather data
async function getWeatherData(latAndLon){
    const KEY_MAIN = 'weatherForecastTestingData';

    const storedData = localStorage.getItem(KEY_MAIN);
    if(storedData !== null){
        const parsedStoredData = JSON.parse(storedData);
        const locationKey = convertLatAndLonToStoredDataKey(latAndLon);
        if(locationKey in parsedStoredData){
            const parsedWeatherData = JSON.parse(parsedStoredData[locationKey]);
            const nowAsInt = convertNowToApiTimeFormat();
            if(nowAsInt < parseInt(parsedWeatherData.list[0].dt)){
                return parsedWeatherData;
            }
        }
    }
    const freshWeatherData = await fetchWeatherData(latAndLon);
    saveWeatherData(freshWeatherData, latAndLon);
    return freshWeatherData;


    function saveWeatherData(weatherData, latAndLon){
        const cachedWeatherData = localStorage.getItem(KEY_MAIN);
        const parsedWeatherData = cachedWeatherData === null
            ? {}
            : JSON.parse(cachedWeatherData)
        ;
        const locationKey = convertLatAndLonToStoredDataKey(latAndLon);
        
        parsedWeatherData[locationKey] = JSON.stringify(weatherData);
        localStorage.setItem(KEY_MAIN, JSON.stringify(parsedWeatherData));
    }
    
    
    function convertLatAndLonToStoredDataKey(latAndLon){
        return `${latAndLon.lat}_${latAndLon.lon}`;
    }
    
    function convertNowToApiTimeFormat(){
        const nowAsDate = new Date();
        return Math.floor(nowAsDate.getTime() / 1000);
    }
}


async function fetchWeatherData({ lat, lon }){
    if(lat === "" || lon === ""){
        throw new Error("Problem fetching weather data");
    }
    const URL = `https://europe-west1-amigo-actions.cloudfunctions.net/recruitment-mock-weather-endpoint/forecast?appid=a2ef86c41a&lat=${lat}&lon=${lon}`;

    return fetch(URL)
    .then(response => {
        if(response.ok){
            return response.json();
        }
        throw new Error("Problem fetching weather data");
    });
}


// || Create the weather element via cloning
function createWeatherSection(weatherData){
    const ID_WRAPPER_TO_COPY = 'place-prices';
    const ID_WEATHER_WRAPPER = 'place-weather';
    
    const wrapperToCopy = document.getElementById(ID_WRAPPER_TO_COPY);
    
    const weatherElement = wrapperToCopy.cloneNode(true);
    updateWeatherElement();
    updateHeading("Weather forecast");
    updateContent();
    return weatherElement;

    
    function updateSectionID(stringWithID){
        return stringWithID.replace(ID_WRAPPER_TO_COPY, ID_WEATHER_WRAPPER);
    }

    function updateWeatherElement(){
        weatherElement.id = ID_WEATHER_WRAPPER;
        weatherElement.dataset.testid = updateSectionID(weatherElement.dataset.testid);
        weatherElement.dataset.abtestid = 'weatherElement';
    }

    function updateContent(){
        const ID_CONTENT_WRAPPER = `accordion-item-body--${ID_WRAPPER_TO_COPY}`;
        
        const contentWrapper = weatherElement.querySelector(`#${ID_CONTENT_WRAPPER}`);
        contentWrapper.id = updateSectionID(contentWrapper.id);
        contentWrapper.setAttribute('aria-labelledBy', updateSectionID(contentWrapper.getAttribute('aria-labelledBy')));
        
        const section = contentWrapper.getElementsByTagName('section')[0];
        const innerDiv = section.getElementsByTagName('div')[0];
        const contentDiv = innerDiv.getElementsByTagName('div')[0];
        clearElementContents(contentDiv);

        const weatherEleContent = createEleWeatherTable(weatherData, ID_WEATHER_WRAPPER);
        
        const weatherEleScrollyBox = document.createElement('div');
        weatherEleScrollyBox.style.maxHeight = '25rem';
        weatherEleScrollyBox.style.maxHeight = '41.25rem';
        weatherEleScrollyBox.style.overflowY = 'auto';
        weatherEleScrollyBox.append(weatherEleContent);
        
        contentDiv.append(weatherEleScrollyBox);
    }

    function updateHeading(newHeading){
        const headingEle = weatherElement.getElementsByTagName('h2')[0];
        const headingEleBtn = headingEle.getElementsByTagName('button')[0];
        const headingEleBtnSpan = headingEleBtn.getElementsByTagName('span')[0];

        headingEleBtn.id = headingEleBtn.id.replace(ID_WRAPPER_TO_COPY, ID_WEATHER_WRAPPER);
        headingEleBtn.setAttribute('aria-controls', updateSectionID(headingEleBtn.getAttribute('aria-controls')));
        headingEleBtn.setAttribute('data-testid', updateSectionID(headingEleBtn.getAttribute('data-testid')));
        
        headingEleBtnSpan.textContent = newHeading;
        headingEleBtn.addEventListener('click', (e) => {
            toggleExpandCollapse(e);
        })
    }

    function toggleExpandCollapse(e){
        const CLASS_EXPANDED = 'accordion-item-expanded';
        const CLASS_COLLAPSED = 'accordion-item-collapsed';
        const CONFIG = {
            expanded: {
                ariaExpanded: 'true',
                ariaHidden: 'false',
                classToRemove: CLASS_COLLAPSED,
                classToAdd: CLASS_EXPANDED,
                visibility: 'visible',
                calcHeight: '500px',
                transformSVG: 'rotateX(180deg)',
            },
            collapsed: {
                ariaExpanded: 'false',
                ariaHidden: 'true',
                classToRemove: CLASS_EXPANDED,
                classToAdd: CLASS_COLLAPSED,
                visibility: 'hidden',
                calcHeight: '0px',
                transformSVG: 'rotateX(0deg)',
            }
        }

        const button = e.target.tagName === 'BUTTON'
            ? e.target
            : e.target.closest('button');
        const expandCollapseEle = document.getElementById(`accordion-item-body--${ID_WEATHER_WRAPPER}`);
    
        const wantExpandedNow = button.getAttribute('aria-expanded') !== 'true';
        const settings = wantExpandedNow ? CONFIG.expanded : CONFIG.collapsed;
    
        button.setAttribute('aria-expanded', settings.ariaExpanded);
        expandCollapseEle.setAttribute('aria-hidden', settings.ariaHidden);
        updateStyles();
    
        if(expandCollapseEle.classList.contains(settings.classToRemove)){
            expandCollapseEle.classList.remove(settings.classToRemove);
        }
        if(!(expandCollapseEle.classList.contains(settings.classToAdd))){
            expandCollapseEle.classList.add(settings.classToAdd);
        }
        return;
        
        function updateStyles(){
            expandCollapseEle.style.visibility = settings.visibility;
            expandCollapseEle.style.setProperty('--calc-height', settings.calcHeight);
    
            const divAroundChevronSVG = button.getElementsByTagName('div')[0];
            const spanAroundChevronSVG = divAroundChevronSVG.getElementsByTagName('span')[0];
            spanAroundChevronSVG.style.transform = settings.transformSVG;
        }
    }
}


function createEleWeatherTable(weatherData, ID_WEATHER_WRAPPER){
    const headings = ["Time", "Weather", "Temperature"];
    
    const myTable = findExistingTableToClone().cloneNode(true);
    myTable.setAttribute('data-testid', replaceSectionIdInName(myTable.getAttribute('data-testid')));
    myTable.style.maxWidth = '650px';

    updateTableCaption();
    updateTableHead();
    updateTableBody();

    return myTable;

    function findExistingTableToClone(){
        const ID_CONTAINER_AROUND_TABLE_TO_COPY = 'accordion-item-body--place-opening-times';
        const sectionContainingCopyEle = document.getElementById(ID_CONTAINER_AROUND_TABLE_TO_COPY);
        return sectionContainingCopyEle.getElementsByTagName('TABLE')[0];
    }
    
    function replaceSectionIdInName(name){
        const ID_SECTION_CONTAINING_ORIGINAL_TABLE = 'place-opening-times';
        return name.replace(ID_SECTION_CONTAINING_ORIGINAL_TABLE, ID_WEATHER_WRAPPER);
    }

    function updateTableBody(){
        const tbody = myTable.getElementsByTagName('TBODY')[0];
        const trNotCloned = tbody.getElementsByTagName('TR')[0]; 
        const emptyTd = trNotCloned.getElementsByTagName('TD')[0].cloneNode(); 
        const emptyTr = trNotCloned.cloneNode(); 
        clearElementContents(tbody);
        
        for(let i = 0; i < weatherData.list.length; i++){
            const weatherRow = createEleWeatherRow(weatherData.list[i], emptyTr, emptyTd, headings);
            tbody.append(weatherRow);
        }
    }

    function updateTableCaption(){
        const caption = myTable.getElementsByTagName('CAPTION')[0];
        const captionH3 = caption.getElementsByTagName('H3')[0];
        captionH3.textContent = "Five day forecast";
        captionH3.setAttribute('data-testid', replaceSectionIdInName(captionH3.getAttribute('data-testid')));
    }

    function updateTableHead(){
        const thead = myTable.getElementsByTagName('THEAD')[0];
        const thSample = thead.getElementsByTagName('TH')[0].cloneNode();
        const headingRow = thead.getElementsByTagName('TR')[0];
        clearElementContents(headingRow);

        for(let i = 0; i < headings.length; i++){
            const newTH = thSample.cloneNode();
            newTH.textContent = headings[i];
            headingRow.append(newTH);
        }
    }
}


function createEleWeatherRow(data, emptyTr, emptyTd, headings){
    const weatherRow = emptyTr.cloneNode();
    
    const whenCell = emptyTd.cloneNode();
    whenCell.setAttribute("label", headings[0]);
    whenCell.textContent = data.dt_txt;
    weatherRow.append(whenCell);

    weatherRow.append(createWeatherCell());
    
    const temperatureCell = emptyTd.cloneNode();
    temperatureCell.setAttribute("label", headings[2]);
    temperatureCell.textContent = `${formatTemperature(data.main.temp_min)} - ${ formatTemperature(data.main.temp_max)}`;
    weatherRow.append(temperatureCell);

    return weatherRow;

    function createWeatherCell(){
        const weatherCell = emptyTd.cloneNode();
        weatherCell.setAttribute("label", headings[1]);
        weatherCell.style.display = 'flex';
        weatherCell.style.alignItems = 'start';
        weatherCell.style.position = 'relative';
        weatherCell.style.gap = '0.5rem';

        const imgWrapper = document.createElement('div');
        imgWrapper.style.background = '#a2d0e6';
        imgWrapper.style.padding = '4px';
        imgWrapper.style.borderRadius = '32px';
        imgWrapper.style.height = '24px';
        
        const img = document.createElement('img');
        img.src = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
        img.width = 32;
        img.height = 32;
        img.alt = '';
        img.style.position = 'relative';
        img.style.top = '-8px';
        imgWrapper.append(img);
        weatherCell.append(imgWrapper);

        const description = document.createElement('span');
        description.textContent = data.weather[0].description;
        weatherCell.append(description);
        
        return weatherCell;
    }

    function formatTemperature(tempFromAPI){
        return `${Math.round(tempFromAPI)}°C`;
    } 
}


// || Inject the weather element
function addWeatherSectionToPage(weatherElement){
    const ID_ELE_BEFORE = 'place-prices';
    const eleBefore = document.getElementById(ID_ELE_BEFORE);
    if(eleBefore !== null){
        eleBefore.after(weatherElement);
    }
}


// || Utility functions
function clearElementContents(ele){
    while (ele.firstChild) {
        ele.removeChild(ele.lastChild);
    }
}

function extractValueFromUrl(urlWithParams, key){
    const hasParams = urlWithParams.indexOf("?") !== -1;
    if(!hasParams){
        return "";
    }
    
    const parametersOnly = urlWithParams.substring(urlWithParams.indexOf("?") + 1);
    const splitURL = parametersOnly.split("&");

    for(let i = 0; i < splitURL.length; i++){
        const kv = splitURL[i].split("=");
        if(kv[0] === key){
            return kv[1];
        }
    }

    return "";
}



