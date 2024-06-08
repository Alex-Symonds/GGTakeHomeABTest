# Overview of my solution for a non-technical audience
## General points to consider
The National Trust's pages lack a "book now" button, so the only way to monitor an increase in visitors will be at the door, with no way to link a particular real-life visitor to a website user.

Instead of dividing users into A and B groups, my solution assumes we'll divide locations (and, by extension, their webpages) into A and B groups: that is, some location pages always get an forecast, others never do. This way comparing visitor counts against historical figures will show us increases/decreases as percentages, which can then be compared between A and B locations.

It also makes sense to monitor whether users presented with the weather forecast actually expressed any interest in it, although for privacy reasons this will depend on users opting in to monitoring.


## Deciding whether to run the test
My solution checks the current page URL against a list of all the page URLs selected for participation in the test group. I used this approach because it doesn't depend on the user's privacy settings.

I considered not running the test for users who'd rejected cookies, but I discarded that idea because:
* Cookie-rejecters can't be excluded altogether: they'd be counted in the visitor figures if they show up
* Including them will exaggerate the effect of the weather forecast, good or bad, making it easier to spot
* It's probably safe to assume they'd show the same degree of interest as cookie-accepters (there's no obvious reason why rejecting cookies would make you any more or less interested in a weather forecast)


## Getting the weather forecast
The "Visitor information" section includes a "Getting here" section, which has a map of the location. It's possible to grab the location's longitude and latitude from the map, so my solution does that, then uses it to request the appropriate weather forecast.

My solution also stores the weather forecast data on the user's computer. If the user returns to the same page, it checks if the forecast would have changed since last time: if not, it reuses the existing data instead of requesting the same information again. This saves on data usage for users and on costs for the company.


## The component
To ensure that the weather forecast blends in nicely with the rest of the webpage, my solution grabs bits and pieces that are already there, makes copies, bodges them together, then modifies the contents.

Regarding the choice of what to copy, I opted for:
* A collapsable list item, as displayed in the "Visitor information" section
* A table, as used in the "Opening times" visitor information

It seems reasonable to describe a weather forecast as "visitor information". There are 40 individual pieces of weather information to display (5 days in 3 hour blocks), so I thought a table would look nice. I considered side-scrolling cards instead, like in the weather app on my phone, but that would've taken a lot more work and wouldn't blend in as well as the copied table.

For now, I decided to display only the overall weather and the min/max temperature, since those are the main details I'd look for. It could, of course, be adjusted to show more or different details. I chose a blue background for the icons partly to hint at the sky and partly because the icons for light and dark clouds made it tricky to find something with enough contrast.

I considered adding the forecast table to the existing "Opening times" instead, but I discarded that idea because it would mean the forecast was hidden (if I wanted to know the weather, would I think to look for it there?) and there was also a mismatch in scope (the forecast is 5 days from now, but "Opening times" had a calendar going well beyond that).


## Placement
Ideally I would've liked to place the weather forecast under "Opening times", since they're thematically linked, but it's hard to argue that a weather forecast should take priority over "Prices", so I put it in the third position instead.


## User behaviour monitoring
My solution respects the user's privacy: if they rejected analytics cookies, it doesn't set any or attempt to access any.

For users who accepted cookies, my code watches the entire page to see if the user clicks to open the Weather forecast. If they do, it records that they clicked it and the time. When they click to close, it does the same again. This makes it possible to determine:
* How many cookie-accepting users clicked the weather forecast
* How long they looked at it before closing

