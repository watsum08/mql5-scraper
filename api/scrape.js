require("dotenv").config();
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const { MongoClient } = require("mongodb");

puppeteer.use(StealthPlugin());

async function addToDb(data) {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri);

  try {
    await client.connect();

    const collection = client
      .db(process.env.MONGODB_DBNAME)
      .collection(process.env.MONGODB_COLLECTIONNAME);
    const result = await collection.insertMany(data);

    console.log(`Inserted ${result.insertedCount} documents into MongoDB`);
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

async function scrapeWebsite() {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({ headless: true }); // headless: false for debugging
  console.log("Browser launched");

  console.log("Opening new page...");
  const page = await browser.newPage();
  console.log("New page opened");

  console.log("Going to base page...");
  await page.goto("https://www.mql5.com/");
  console.log("On base page");

  console.log("Navigating to login page...");
  await page.goto("https://www.mql5.com/en/auth_login");
  console.log("On login page");

  // login
  await page.waitForSelector("#Login");
  await page.type("#Login", process.env.MQL5_USERNAME);
  await page.type("#Password", process.env.MQL5_PASSWORD);
  await page.click("#loginSubmit");

  console.log("Logged in successfully !");

  // wait for navigation to complete
  await page.waitForNavigation();

  // go to the page to scrape
  await page.goto("https://www.mql5.com/en/users/taherhalimi/feedbacks");

  // perform your scraping here...
  // after navigating to the page with the reviews...

  console.log("Extracting reviews...");
  const data = await page.evaluate(() => {
    const reviewElements = document.querySelectorAll(".rowLine"); // select each review element
    let reviews = []; // this array will hold each review

    reviewElements.forEach((reviewElement) => {
      let review = {};

      // Extract the rating
      const ratingElement = reviewElement.querySelector(
        ".rating-block-small__value"
      );
      if (ratingElement) {
        // count the number of <i> tags within the rating element
        let rating = ratingElement.getElementsByTagName("i").length;
        review.rating = rating;
      }

      // Extract the customer's name
      const nameElement = reviewElement.querySelector(".author");
      if (nameElement) {
        review.name = nameElement.innerText;
      }

      // Extract the review message
      const messageElements = reviewElement.querySelectorAll(
        ".mainContainer > span"
      );
      if (messageElements.length > 2) {
        review.message = messageElements[2].innerText;
      }

      reviews.push(review);
    });

    return reviews;
  });

  await browser.close();

  return data;
}

// This is your serverless function for Vercel
module.exports = async (req, res) => {
  try {
    const data = await scrapeWebsite();
    console.log(data);
    await addToDb(data);
    res.status(200).send("Scrape and data insert successful !");
  } catch (err) {
    console.error(err);
    res.status(500).send("An error occurred");
  }
};

{
  /*
scrapeWebsite()
  .then((data) => {
    console.log(data);

    addToDb(data).catch(console.error);
  })
  .catch((err) => console.error(err));
*/
}
