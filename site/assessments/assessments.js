const assessmentHost = 'https://usc.qualtrics.com';
const assessmentUrls = [
    '/jfe/form/poms',
    '/jfe/form/dass',
    '/jfe/form/ffmq',
    '/jfe/form/demo'
];

let curAssessment = 0;
let iframeNode;
let uid;
let topDomNode

export function showAssessment(userId, domNode) {
    uid = userId;
    topDomNode = domNode;
    while (domNode.hasChildNodes()) {
        domNode.firstChild.remove()
    }
    const iframe = document.createElement('iframe');
    iframe.setAttribute('src', assessmentHost + assessmentUrls[curAssessment] + `?uid=${uid}`);
    iframe.setAttribute('width', '100%');
    iframe.setAttribute('height', '600');
    iframeNode = iframe;
    domNode.appendChild(iframe);
    const nav = makeNav();
    domNode.appendChild(nav);
}

function nextAssessment() {
    if (curAssessment >= assessmentUrls.length - 1) {
        showAllDone();
        return
    }

    curAssessment += 1;
    const url = assessmentHost + assessmentUrls[curAssessment] + `?uid=${uid}`;
    iframeNode.src = url;
}

function showAllDone() {
    while (topDomNode.hasChildNodes()) {
        topDomNode.firstChild.remove();
    }
    const allDoneDiv = document.createElement('div');
    allDoneDiv.innerHTML = '<h2>All done! The next step is to learn how to use the application that will guide you through your breathing exercises.</h2>';
    topDomNode.appendChild(allDoneDiv);
}

function makeNav() {
    const div = document.createElement('div');
    const button = document.createElement('button', { id: 'next'});
    button.addEventListener('click', nextAssessment);
    button.innerHTML = 'Next Survey >>'
    button.setAttribute('style', 'width: 150px');
    div.appendChild(button);
    return div;
}