let sequences = {};  
let sequenceNames = [];
let currentSequenceIndex = 0;
let points = []; // Points for current sequence
let occludedMode = false;
let isZoomRegionVisible = false;

// Now we can have up to 4 points per sequence:
// Each image can have at most 1 Index and 1 Thumb point.
// That means image constraints:
// - For image: max 1 'index' point
// - For image: max 1 'thumb' point
// With 2 images: total up to 4 points (2 per image)

let currentCategory = 'index'; // default

// category => point color
const categoryColors = {
    'index': 'red',
    'thumb': 'green'
};

const leftCanvas = document.getElementById('leftImage');
const rightCanvas = document.getElementById('rightImage');
const canvases = [leftCanvas, rightCanvas];

const loadSequencesButton = document.getElementById('loadSequencesButton');
const loadAnnotationsButton = document.getElementById('loadAnnotationsButton');
const imageLoader = document.getElementById('imageLoader');
const annotationLoader = document.getElementById('annotationLoader');
const occludedButton = document.getElementById('occludedButton');
const undoButton = document.getElementById('undoButton');
const saveButton = document.getElementById('saveButton');
const resetImageButton = document.getElementById('resetImageButton');
const resetAllButton = document.getElementById('resetAllButton');
const categoryToggle = document.getElementById('categoryToggle');
const zoomSlider = document.getElementById('zoom-slider');

const sequenceNameElement = document.getElementById('sequenceName');
const sequenceIndexElement = document.getElementById('sequenceIndex');
const totalSequencesElement = document.getElementById('totalSequences');

let originalWidths = [];
let originalHeights = [];
let loadedImages = {};

function updateProgress() {
    sequenceNameElement.textContent = sequenceNames[currentSequenceIndex];
    sequenceIndexElement.textContent = currentSequenceIndex + 1;
    totalSequencesElement.textContent = sequenceNames.length;
}

function checkZoomInCondition() {
    const contactImgName = sequences[sequenceNames[currentSequenceIndex]][1]; // 左图
    const hasIndex = points.some(p => p.imgName === contactImgName && p.category === 'index');
    const hasThumb = points.some(p => p.imgName === contactImgName && p.category === 'thumb');
    const btn = document.getElementById('zoomInContactRegionButton');
    btn.disabled = !(hasIndex && hasThumb);
}

function loadCurrentSequenceImages() {
    if (sequenceNames.length === 0) return;
    const seqName = sequenceNames[currentSequenceIndex];
    const seqImages = sequences[seqName]; // Array of two image names

    const leftImgName = seqImages[1]; // Contract
    const rightImgName = seqImages[0]; // Prediction

    const leftImg = new Image();
    const rightImg = new Image();

    let imagesLoaded = 0;
    const onLoad = () => {
        imagesLoaded++;
        if (imagesLoaded === 2) {
            updateProgress();
            redrawPoints();
            stopLoading();
            updateProgress();
        }
    };

    leftImg.onload = () => {
        drawImageToCanvas(leftImg, leftCanvas, 0);
        onLoad();
    };
    rightImg.onload = () => {
        drawImageToCanvas(rightImg, rightCanvas, 1);
        onLoad();
    };

    leftImg.src = loadedImages[leftImgName];
    rightImg.src = loadedImages[rightImgName];

    leftImg.onerror = rightImg.onerror = function() {
        alert("Failed to load image.");
        stopLoading();
    };
}

function drawImageToCanvas(img, canvas, index) {
    const context = canvas.getContext('2d');
    const maxWidth = window.innerWidth / 2 - 100; 
    const maxHeight = window.innerHeight - 300; 
    const aspectRatio = img.width / img.height;

    if (img.width > maxWidth || img.height > maxHeight) {
        if (aspectRatio > 1) {
            canvas.width = maxWidth;
            canvas.height = maxWidth / aspectRatio;
        } else {
            canvas.height = maxHeight;
            canvas.width = maxHeight * aspectRatio;
        }
    } else {
        canvas.width = img.width;
        canvas.height = img.height;
    }

    originalWidths[index] = img.width;
    originalHeights[index] = img.height;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(img, 0, 0, canvas.width, canvas.height);
}

function stopLoading() {
    document.querySelector('title').innerText = "Image Annotation Tool";
}

function annotatePoint(event, imageIndex) {
    const seqName = sequenceNames[currentSequenceIndex];
    const seqImages = sequences[seqName];
    const imgName = (imageIndex === 0) ? seqImages[1] : seqImages[0];

    // Check constraints:
    // We want at most 1 Index point and 1 Thumb point per image.
    const sameImageSameCategory = points.filter(p => p.imgName === imgName && p.category === currentCategory).length;
    if (sameImageSameCategory >= 1) {
        alert(`You already annotated a ${currentCategory} point in this image.`);
        return;
    }

    // Check total points - max 4 total (2 categories per image * 2 images)
    if (points.length >= 4) {
        alert("You already have 4 points for this sequence (Index+Thumb on both images). Please undo if you want to change.");
        return;
    }

    const canvas = canvases[imageIndex];
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (originalWidths[imageIndex] / rect.width);
    const y = (event.clientY - rect.top) * (originalHeights[imageIndex] / rect.height);

    let isOccluded = occludedMode;
    if (occludedMode) {
        occludedButton.classList.remove('active');
        occludedMode = false;
    }

    const pointData = {x,y,imgName, category: currentCategory, occluded: isOccluded};
    points.push(pointData);
    saveProgress();

    const context = canvas.getContext('2d');
    const canvasX = x * (rect.width / originalWidths[imageIndex]);
    const canvasY = y * (rect.height / originalHeights[imageIndex]);
    context.lineWidth = 1;
    context.strokeStyle = "white";
    context.beginPath();
    context.arc(canvasX, canvasY, 5, 0, 2 * Math.PI);

    const pointColor = categoryColors[currentCategory]; 
    if (isOccluded) {
        context.strokeStyle = pointColor;
        context.lineWidth = 3;
        context.stroke();
    } else {
        context.fillStyle = pointColor;
        context.fill();
        context.lineWidth = 1;
        context.stroke();
    }
    checkZoomInCondition();
}

function handleOccluded() {
    occludedMode = true;
    occludedButton.classList.add('active');
}

function handleUndo() {
    if (points.length > 0) {
        points.pop();
        saveProgress();
        loadCurrentSequenceImages();
    }
}

function saveAnnotations() {
    const allAnnotations = {};

    sequenceNames.forEach(sequenceName => {
        const savedPoints = localStorage.getItem(`${sequenceName}_points`);
        const annotations = {
            sequence: sequenceName,
            points: []
        };
        if (savedPoints) {
            const pts = JSON.parse(savedPoints);
            pts.forEach(point => {
                annotations.points.push({
                    imgName: point.imgName,
                    x: point.x,
                    y: point.y,
                    category: point.category,
                    occluded: point.occluded || false
                });
            });
        }
        allAnnotations[sequenceName] = annotations;
    });

    const json = JSON.stringify(allAnnotations, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `all_annotations.json`;
    link.click();
}

function saveProgress() {
    localStorage.setItem(`${sequenceNames[currentSequenceIndex]}_points`, JSON.stringify(points));
}

function loadProgress() {
    const savedPoints = localStorage.getItem(`${sequenceNames[currentSequenceIndex]}_points`);
    if (savedPoints) {
        points = JSON.parse(savedPoints);
    } else {
        points = [];
    }
}

function redrawPoints() {
    const seqName = sequenceNames[currentSequenceIndex];
    const seqImages = sequences[seqName];

    points.forEach((point) => {
        const imgName = point.imgName;
        let imageIndex = (imgName === seqImages[1]) ? 0 : 1;

        const canvas = canvases[imageIndex];
        const context = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        context.lineWidth = 1;
        context.strokeStyle = "white";

        const pointColor = categoryColors[point.category];

        const canvasX = point.x * (rect.width / originalWidths[imageIndex]);
        const canvasY = point.y * (rect.height / originalHeights[imageIndex]);
        context.beginPath();
        context.arc(canvasX, canvasY, 5, 0, 2 * Math.PI);
        if (point.occluded) {
            context.strokeStyle = pointColor;
            context.lineWidth = 3;
            context.stroke();
        } else {
            context.fillStyle = pointColor;
            context.lineWidth = 1;
            context.fill();
            context.stroke();
        }
    });
    checkZoomInCondition();

}

function resetImageAnnotations() {
    points = [];
    saveProgress();
    loadCurrentSequenceImages();
    checkZoomInCondition();

}

function resetAllAnnotations() {
    sequenceNames.forEach(sequence => {
        localStorage.removeItem(`${sequence}_points`);
    });
    points = [];
    loadCurrentSequenceImages();
    checkZoomInCondition();

}

function scrollImages(event) {
    if (event.key === 'ArrowLeft') {
        currentSequenceIndex = (currentSequenceIndex - 1 + sequenceNames.length) % sequenceNames.length;
        loadCurrent();
    } else if (event.key === 'ArrowRight') {
        currentSequenceIndex = (currentSequenceIndex + 1) % sequenceNames.length;
        loadCurrent();
    }
}

function loadCurrent() {
    loadProgress();
    loadCurrentSequenceImages();
}

function groupImagesIntoSequences(imageNames) {
    let prefixMap = {};
    for (let name of imageNames) {
        const parts = name.split("_");
        if (parts.length < 2) continue; 
        const seqKey = parts.slice(0, parts.length-1).join("_");
        if (!prefixMap[seqKey]) prefixMap[seqKey] = [];
        prefixMap[seqKey].push(name);
    }

    for (let key in prefixMap) {
        if (prefixMap[key].length === 2) {
            sequences[key] = prefixMap[key].sort(); 
        }
    }

    sequenceNames = Object.keys(sequences);
}

loadSequencesButton.addEventListener('click', () => {
    imageLoader.click();
});

imageLoader.addEventListener('change', (event) => {
    const files = Array.from(event.target.files);
    let remaining = files.length;
    const imageNames = [];
    files.forEach(file => {
        const url = URL.createObjectURL(file);
        loadedImages[file.name] = url;
        imageNames.push(file.name);
        remaining--;
        if (remaining === 0) {
            groupImagesIntoSequences(imageNames);
            if (sequenceNames.length > 0) {
                currentSequenceIndex = 0;
                loadCurrent();
            } else {
                alert("No valid pairs found.");
            }
        }
    });
});

loadAnnotationsButton.addEventListener('click', () => {
    annotationLoader.click();
});

annotationLoader.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    console.log("📂 Annotation file selected:", file.name); // ✅ 检查文件是否选择成功

    const reader = new FileReader();
    reader.onload = () => {
        try {    
            const loadedAnnotations = JSON.parse(reader.result);
            console.log("✅ Parsed annotations:", loadedAnnotations);
            for (let seqName in loadedAnnotations) {
                console.log("📌 Found sequence in annotation:", seqName); 
                if (loadedAnnotations[seqName].points) {
                    console.log('💾 Saving ${seqName}_points to localStorage');
                    localStorage.setItem(`${seqName}_points`, JSON.stringify(loadedAnnotations[seqName].points));
                } else {
                    console.warn('⚠️ No points found for sequence ${seqName}');
                }
            }
            loadProgress();
            loadCurrentSequenceImages();
        } catch (error) {
            console.error("❌ Error parsing annotations:", error);
        }
    };
    reader.readAsText(file);
});

occludedButton.addEventListener('click', handleOccluded);
undoButton.addEventListener('click', handleUndo);
saveButton.addEventListener('click', saveAnnotations);
resetImageButton.addEventListener('click', resetImageAnnotations);
resetAllButton.addEventListener('click', resetAllAnnotations);
document.addEventListener('keydown', scrollImages);

document.addEventListener('DOMContentLoaded', function() {
    const magnifier = document.getElementById('magnifier');
    const zoomSlider = document.getElementById('zoom-slider');
    const zoomValueLabel = document.getElementById('zoom-value');

    zoomSlider.addEventListener('input', function() {
        zoomValueLabel.textContent = zoomSlider.value;
    });

    function showMagnifier(event, canvas) {
        const zoom = parseInt(zoomSlider.value); 
        if (zoom === 1) {
            magnifier.style.display = 'none';
            return;
        }

        const context = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const sWidth = 100 / zoom;
        const sHeight = 100 / zoom;

        magnifier.style.display = 'block';
        magnifier.style.left = `${event.clientX - 50}px`;
        magnifier.style.top = `${event.clientY - 50}px`;

        const magnifierCanvas = document.createElement('canvas');
        magnifierCanvas.width = 100;
        magnifierCanvas.height = 100;
        const magCtx = magnifierCanvas.getContext('2d');
        magCtx.drawImage(canvas, x - sWidth / 2, y - sHeight / 2, sWidth, sHeight, 0, 0, 100, 100);

        magnifier.innerHTML = '';
        magnifier.appendChild(magnifierCanvas);
    }

    canvases.forEach(canvas => {
        canvas.addEventListener('mousemove', function(event) {
            showMagnifier(event, canvas);
        });
        canvas.addEventListener('mouseout', function() {
            magnifier.style.display = 'none';
        });
    });
});

let redrawZoomRegion = () => {
    const canvas = leftCanvas;
    const ctx = canvas.getContext('2d');
    const zoom = parseInt(zoomSlider.value);

    if (!isZoomRegionVisible) {
        return;
    }

    const contactImgName = sequences[sequenceNames[currentSequenceIndex]][1];
    const indexPoint = points.find(p => p.imgName === contactImgName && p.category === 'index');
    const thumbPoint = points.find(p => p.imgName === contactImgName && p.category === 'thumb');
    if (!indexPoint || !thumbPoint) return;

    const centerX = (indexPoint.x + thumbPoint.x) / 2;
    const centerY = (indexPoint.y + thumbPoint.y) / 2;

    // if (zoom <= 1) return;

    const scaleX = canvas.width / originalWidths[0];
    const scaleY = canvas.height / originalHeights[0];

    const canvasX = centerX * scaleX;
    const canvasY = centerY * scaleY;

    // const sWidth = 100 / zoom;
    // const sHeight = 100 / zoom;
    // const cropW = sWidth * scaleX;
    // const cropH = sHeight * scaleY;
    const magnifierSize = 500;
    const sWidth = magnifierSize / zoom;
    const sHeight = magnifierSize / zoom;
    const cropW = sWidth * scaleX;
    const cropH = sHeight * scaleY;

    const magnifierCanvas = document.createElement('canvas');
    magnifierCanvas.width = 250;
    magnifierCanvas.height = 250;
    const magCtx = magnifierCanvas.getContext('2d');

    magCtx.drawImage(
        canvas,
        canvasX - cropW / 2,
        canvasY - cropH / 2,
        cropW,
        cropH,
        0, 0,
        250,
        250
    );

    // ⬅️ 显示放大结果在左上角
    ctx.drawImage(magnifierCanvas, 10, 10, 250, 250);
}

zoomInContactRegionButton.addEventListener('click', () => {
    isZoomRegionVisible = !isZoomRegionVisible;
    if (isZoomRegionVisible) {
        redrawZoomRegion()
    } else {
        loadCurrentSequenceImages();
    }
});
zoomSlider.addEventListener('input', redrawZoomRegion);

canvases.forEach((canvas, index) => {
    canvas.addEventListener('click', (event) => {
        annotatePoint(event, index);
    });
});

// Toggle category
categoryToggle.addEventListener('click', () => {
    if (currentCategory === 'index') {
        currentCategory = 'thumb';
        categoryToggle.classList.remove('index-mode');
        categoryToggle.classList.add('thumb-mode');
    } else {
        currentCategory = 'index';
        categoryToggle.classList.add('index-mode');
        categoryToggle.classList.remove('thumb-mode');
    }
});