require("dotenv").config();
const { MongoClient } = require("mongodb");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");

puppeteer.use(StealthPlugin());

async function addToDb(data) {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri, { useUnifiedTopology: true });

  try {
    await client.connect();

    const collection = client
      .db(process.env.MONGODB_DBNAME)
      .collection(process.env.MONGODB_COLLECTIONNAME);

    for (const item of data) {
      // Specify the unique identifier for each item in your data
      const filter = { name: item.name, message: item.message };

      // Only insert if a document matching the filter doesn't exist
      const existingDocument = await collection.findOne(filter);
      if (!existingDocument) {
        await collection.insertOne(item);
      }
    }

    console.log(`Inserted documents into MongoDB as needed`);
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

function getLastPageNumber() {
  const paginatorElement = document.querySelector(".paginatorEx");
  const lastPageLink = paginatorElement.querySelector("a:last-child");
  const lastPageUrl = lastPageLink.getAttribute("href");
  const lastPageNumber = lastPageUrl.match(/page(\d+)/)[1];
  return parseInt(lastPageNumber);
}

async function scrapeWebsite() {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: "/usr/bin/chromium-browser",
  });

  console.log("Browser launched!");
  const page = await browser.newPage();

  console.log("Going to base page...");
  await page.goto("https://www.mql5.com/", { waitUntil: "domcontentloaded" });
  console.log("On base page");

  console.log("Navigating to login page...");
  await page.goto("https://www.mql5.com/en/auth_login", {
    waitUntil: "domcontentloaded",
  });
  console.log("On login page");

  // login
  await page.waitForSelector("#Login");
  await page.type("#Login", process.env.MQL5_USERNAME);
  await page.type("#Password", process.env.MQL5_PASSWORD);
  await page.click("#loginSubmit");

  console.log("Logged in successfully!");

  // wait for navigation to complete
  await page.waitForNavigation({ waitUntil: "domcontentloaded" });

  // go to the page to scrape
  await page.goto("https://www.mql5.com/en/users/taherhalimi/feedbacks", {
    waitUntil: "domcontentloaded",
  });

  // perform your scraping here...
  // after navigating to the page with the reviews...

  console.log("Extracting reviews...");
  const lastPageNumber = await page.evaluate(getLastPageNumber);

  // Scrape all pages
  const data = [];
  for (let currentPage = 1; currentPage <= lastPageNumber; currentPage++) {
    console.log(`Scraping page ${page} of ${lastPageNumber}`);

    // Go to the page to scrape
    await page.goto(
      `https://www.mql5.com/en/users/taherhalimi/feedbacks/page${currentPage}`,
      { waitUntil: "domcontentloaded" }
    );

    // Extract reviews from the current page
    const pageData = await page.evaluate(() => {
      const reviewElements = document.querySelectorAll(".rowLine");
      let reviews = [];

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

        // Extract the date
        const dateElement = reviewElement.querySelector(".dateContainer");
        if (dateElement) {
          review.date = dateElement.innerText;
        }

        reviews.push(review);
      });

      return reviews;
    });

    data.push(...pageData);
  }

  await browser.close();

  return data;
}

async function runScraping() {
  console.time("Execution time"); // Start the timer
  console.log("Running scraper...");

  try {
    const data = await scrapeWebsite();
    console.log(data);
    await addToDb(data);
    console.log("Scrape and data insert succesful !");
  } catch (err) {
    console.error(err);
    console.log("An error occured.");
  } finally {
    console.timeEnd("Execution time"); // End the timer
  }
}

runScraping();
