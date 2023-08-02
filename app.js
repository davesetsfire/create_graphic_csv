const express = require('express');
const app = express();
const fs = require('fs');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const sharp = require('sharp');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Serve the HTML page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// Handle form submission
app.post('/submit', async (req, res) => {
  const url = req.body.url;
  const epoche = req.body.epoche;
  const category = req.body.category;

  if (url) {
    try {
      const htmlContent = await fetchHTMLContent(url);
      if (htmlContent) {
        const message = extractDataFromHTMLCategory(htmlContent, category, epoche);
        return res.send(message);
      }
    } catch (error) {
      console.error('Error processing the URL:', error);
      return res.status(500).send('Error processing the URL.');
    }
  }

  return res.status(400).send('Invalid URL.');
});

// Function to fetch HTML content from the given URL
async function fetchHTMLContent(url) {
  const response = await axios.get(url);
  return response.data;
}

 function extractDataFromHTMLCategory(htmlContent, category, epoche) {
  const { document } = new JSDOM(htmlContent).window;

  const links = document.querySelectorAll('a.woocommerce-LoopProduct-link');
  links.forEach( async (element) => {
    const htmlContentProduct = await fetchHTMLContent(element.getAttribute('href'));
    console.log(element.getAttribute('href'));
    
    if (htmlContentProduct) {
      const { imageUrl, entryTitle, description, keywords } = extractDataFromHTML(htmlContentProduct);
      const imageName = await downloadImage(imageUrl);
    if (imageName) {
      const csvData = `"${entryTitle}","${description}",${category},"${keywords}",${imageName},,,,,no,In gedruckter Form,,Pixelgrafik,Rechte liegen beim Grafiker,${epoche},,,,,,`;
      appendToCSVWithCheck(csvData, entryTitle, description);
    }
  }
  });
  return "Successful category";
}
// Function to extract the required information from the HTML content
function extractDataFromHTML(htmlContent) {
  const { document } = new JSDOM(htmlContent).window;

  const imageUrl = document.querySelector('img.wp-post-image').getAttribute('data-large_image');
  const entryTitle = document.querySelector('h1.entry-title').textContent.trim();
  if (document.querySelector('div.product-short-description')){
     description = document.querySelector('div.product-short-description').textContent.trim().replace(/\r?\n/g, ' ');
  }else{
     description = "Siehe Bild";
  }
  if (document.querySelector('span.tagged_as')){
    keywords = document.querySelector('span.tagged_as').textContent.trim().replace('Schlagwörter: ', '');
  }else{
    keywords = "";
  }
  return {
    imageUrl,
    entryTitle,
    description,
    keywords
  };
}

// Function to download the image and save it to the "images" folder with a timestamp as the name
async function downloadImage(imageUrl) {
  const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
  const imageName = `${Date.now()}.jpg`;
  const resizedImageName = `${Date.now()}_1.jpg`

  fs.writeFileSync(`images/${imageName}`, response.data);

  await resizeImage(`images/${imageName}`, 1050, 1050, `images/${resizedImageName}`);

  return resizedImageName;
}


async function resizeImage(imagePath, minWidth, minHeight, resizedImagePath) {
  const imageBuffer = await fs.promises.readFile(imagePath);
  // Use sharp to calculate the aspect ratio of the original image
  const metadata = await sharp(imageBuffer).metadata();
  const aspectRatio = metadata.width / metadata.height;

  // Calculate the new width and height while maintaining the aspect ratio and meeting the minimum requirements
  let newWidth = minWidth;
  let newHeight = minHeight;

  if (metadata.width < metadata.height) {
    // Calculate new height based on minimum width and aspect ratio
    newWidth = minWidth
    newHeight = null;
  } else {
    // Calculate new width based on minimum height and aspect ratio
    newHeight = minHeight;
    newWidth= null;
  }
  
  await sharp(imagePath)
    .resize(newWidth, newHeight, {
      fit: 'inside',
    })
    .toFile(resizedImagePath)
    .then(info => { 
      if (info.width<700)
        resizeImage(imagePath, 1050, null, resizedImagePath)
     })
    .then(() => {
      fs.rm(imagePath,{ force:true }, (err) => {
        if (err) console.error(err.message);
        console.log('path/file.txt was deleted');
      });
    });
}

// Function to append data to the CSV file
function appendToCSV(data, csvFileName) {
  fs.appendFileSync(csvFileName, data);
}

// Function to append data to the CSV file with a check for duplicates
function appendToCSVWithCheck(data, entryTitle, description) {
const isLineExisting = checkIfLineExists('master_graphic.csv', entryTitle, description);
if (!isLineExisting) {
  appendToCSV(`\n${data}`, 'master_graphic.csv');
  appendToCSV(`\n${data}`, 'graphic.csv');
}
}

// Function to check if a line already exists in the CSV file
function checkIfLineExists(csvFileName, entryTitle, description) {
  const fileContent = fs.readFileSync(csvFileName, 'utf-8');
  return fileContent.includes(entryTitle) && fileContent.includes(description);

}

// Start the server
const port = 3000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
