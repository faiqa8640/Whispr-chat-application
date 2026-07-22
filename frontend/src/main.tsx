//entry point of your React application. 
// It is the first file that runs when your application starts.

//Its job is to help developers find mistakes.
//works only in the developmenent => do nothing in prodrocction
import { StrictMode } from 'react'

//React itself doesn't know where to show your application
//our browser only understands HTML.
//React needs a place inside the HTML page where it can display everything.
//That's what createRoot() does
//Think of it like renting an empty apartment
//REACTDOM =>Responsible for Putting React on the web page.
import { createRoot } from 'react-dom/client'
import './index.css'//import global css
import App from './App.tsx'


//doucment=> Whenever your browser opens a webpage, 
// it creates something called the Document Object Model (DOM)
//The browser creates an object representing a page
//JavaScript accesses that object using document.
//getElementById('root')=> searchers element where id is root
//! => This is the TypeScript non-null assertion operator.
//It only tells TypeScript to stop warning about the possibility of null
//Without it, you'd get a TypeScript error because createRoot expects a real HTML element, not null.

//createRoot(document.getElementById('root')!)=>React creates a root attached to that HTML element.
//The root has a method called render().
//it Display this React component inside the root."
createRoot(document.getElementById('root')!).render(
  //React renders App, but wraps it in StrictMode
  ////<App />=>Create an instance of the App component and render whatever it returns.
  <StrictMode>
    <App />
  </StrictMode>,
)

//flow of execution :
//browser open => index.html loads =>main.tsx runs 






//THE BELOW IS THE INDEX.HTML FILE AND ITS COMMENTS => WHICH PROVIDE THE MAIN ROOT DIV
// --------------------------------------------------------------
// <!-- this file is called index.html, and 
//  it is the very first page the browser loads before React even starts. -->
//  <!-- it act as a empty house where you display your app -->

//  <!-- This document is written using HTML5. -->
// <!doctype html> 
// <!-- lang="en" attribute tells browsers, search engines, and screen readers that the content is in English. -->
// <html lang="en">
//   <!-- The <head> contains information about the webpag -->
//   <head>
//     <!-- This tells the browser to use UTF-8 encoding -->
//      <!-- UTF-8 supports characters from many languages and symbols. -->
//     <meta charset="UTF-8" />
//     <!-- This sets the small icon shown in the browser tab (the thunder) -->
//     <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
//     <!-- preconnect => We're going to use Google Fonts soon. Start connecting now. -->
//     <link rel="preconnect" href="https://fonts.googleapis.com" />
//     <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
//     <link
//       href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Manrope:wght@400;500;600;700&display=swap"
//       rel="stylesheet"
//     />
//     <!-- This makes your website responsive on phones and tablets.
//     width=device-width= >Use the actual width of the device. -->
//     <meta name="viewport" content="width=device-width, initial-scale=1.0" />
//     <title>frontend</title>
//     <!-- This loads Google's Identity Services library => for signin with google -->
//     <script src="https://accounts.google.com/gsi/client" async defer></script>
//   </head>
//   <body>
//     <!-- React finds this <div> and starts rendering your application inside it.
//       when the main.tsx runs 
//       Everything your users see is placed inside this single element -->
//     <div id="root"></div>
//     <!-- This is what starts your React app. -->
//      <!-- src="/src/main.tsx"=>The browser (through Vite during development) loads your main.tsx file. 
//       type module tell the browser that the script is an ES Module,
//        which means it can use modern JavaScript features-->
//     <script type="module" src="/src/main.tsx"></script>
//   </body>
// </html>

// <!-- index.html is the bridge between the browser and your React application -->
//  <!-- flow -->
//   <!-- broweser requests your app -->
//    <!-- Loads index.html -->
//     <!-- Finds <div id="root"></div> -->
//      <!-- main.tsx finds the root div -->
//       <!-- React creates a root -->
//        <!-- React creates a root -->
//         <!-- Your entire React application appears inside<div id="root"></div> -->
