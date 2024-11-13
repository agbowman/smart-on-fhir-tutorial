(function (window) {
  window.extractData = function () {
    var ret = $.Deferred();

    function onError() {
      console.log('Loading error', arguments);
      ret.reject();
    }

    function onReady(smart) {
      if (smart.hasOwnProperty('patient')) {
        var patient = smart.patient;
        var pt = patient.read();
        var obv = smart.patient.api.fetchAll({
          type: 'Observation',
          query: {
            code: {
              $or: ['http://loinc.org|8302-2', 'http://loinc.org|8462-4',
                'http://loinc.org|8480-6', 'http://loinc.org|2085-9',
                'http://loinc.org|2089-1', 'http://loinc.org|55284-4'
              ]
            }
          }
        });

        $.when(pt, obv).fail(onError);

        $.when(pt, obv).done(function (patient, obv) {
          var byCodes = smart.byCodes(obv, 'code');
          var gender = patient.gender;

          var fname = '';
          var lname = '';

          // if (typeof patient.name[0] !== 'undefined') {
          //   fname = patient.name[0].given.join(' ');
          //   lname = patient.name[0].family.join(' ');
          // }

          var height = byCodes('8302-2');
          var systolicbp = getBloodPressureValue(byCodes('55284-4'), '8480-6');
          var diastolicbp = getBloodPressureValue(byCodes('55284-4'), '8462-4');
          var hdl = byCodes('2085-9');
          var ldl = byCodes('2089-1');

          var p = defaultPatient();
          p.birthdate = patient.birthDate;
          p.gender = gender;
          // p.fname = fname;
          // p.lname = lname;
          p.fname = "test";
          p.lname = "test";
          p.height = getQuantityValueAndUnit(height[0]);

          if (typeof systolicbp != 'undefined') {
            p.systolicbp = systolicbp;
          }

          if (typeof diastolicbp != 'undefined') {
            p.diastolicbp = diastolicbp;
          }

          p.hdl = getQuantityValueAndUnit(hdl[0]);
          p.ldl = getQuantityValueAndUnit(ldl[0]);

          ret.resolve(p);
        });
      } else {
        onError();
      }
    }

    FHIR.oauth2.ready(onReady, onError);
    return ret.promise();

  };

  function defaultPatient() {
    return {
      fname: {
        value: ''
      },
      lname: {
        value: ''
      },
      gender: {
        value: ''
      },
      birthdate: {
        value: ''
      },
      height: {
        value: ''
      },
      systolicbp: {
        value: ''
      },
      diastolicbp: {
        value: ''
      },
      ldl: {
        value: ''
      },
      hdl: {
        value: ''
      },
    };
  }

  function getBloodPressureValue(BPObservations, typeOfPressure) {
    var formattedBPObservations = [];
    BPObservations.forEach(function (observation) {
      var BP = observation.component.find(function (component) {
        return component.code.coding.find(function (coding) {
          return coding.code == typeOfPressure;
        });
      });
      if (BP) {
        observation.valueQuantity = BP.valueQuantity;
        formattedBPObservations.push(observation);
      }
    });

    return getQuantityValueAndUnit(formattedBPObservations[0]);
  }

  function getQuantityValueAndUnit(ob) {
    if (typeof ob != 'undefined' &&
      typeof ob.valueQuantity != 'undefined' &&
      typeof ob.valueQuantity.value != 'undefined' &&
      typeof ob.valueQuantity.unit != 'undefined') {
      return ob.valueQuantity.value + ' ' + ob.valueQuantity.unit;
    } else {
      return undefined;
    }
  }

  window.drawVisualization = function (p) {
    $('#holder').show();
    $('#loading').hide();
    $('#fname').html(p.fname);
    $('#lname').html(p.lname);
    $('#gender').html(p.gender);
    $('#birthdate').html(p.birthdate);
    $('#height').html(p.height);
    $('#systolicbp').html(p.systolicbp);
    $('#diastolicbp').html(p.diastolicbp);
    $('#ldl').html(p.ldl);
    $('#hdl').html(p.hdl);
  };





  ///TESTING CODE VVVVV
  window.submitClinicalNote = function () {
    var noteTitle = $('#note-title').val();
    var noteContent = $('#note-content').val();

    console.log('Submitting Note:', {
      title: noteTitle,
      content: noteContent
    });

    if (!noteTitle || !noteContent) {
      $('#errors').html('<p>Please fill in all required fields.</p>');
      return;
    }

    var documentReference = createDocumentReference(noteTitle, noteContent);

    window.smart.api.create({
      resourceType: 'DocumentReference',
      body: documentReference
    }).then(function (response) {
      $('#feedback-message').text('Clinical note submitted successfully!');
      $('#feedback').show();
      $('#errors').hide();
      $('#clinical-note-form')[0].reset();

      // NEW: Fetch updated notes list after successful submission
      fetchClinicalNotes();
    }).catch(function (error) {
      console.error('Error submitting clinical note:', error);
      $('#errors').html('<p>Error submitting clinical note. Please try again.</p>');
      $('#feedback').hide();
    });
  };

  function createDocumentReference(title, content) {
    var encodedContent = btoa(unescape(encodeURIComponent(content)));

    return {
      status: 'current',
      type: {
        coding: [{
          system: 'http://loinc.org',
          code: '34133-9',
          display: 'Summarization of episode note'
        }]
      },
      subject: {
        reference: 'Patient/' + window.smart.patient.id
      },
      content: [{
        attachment: {
          contentType: 'text/plain',
          data: encodedContent
        }
      }],
      context: {
        encounter: {
          reference: 'Encounter/' + window.smart.encounter.id
        }
      }
    };
  }

  // Add event handler initialization
  $(document).ready(function () {
    // Attach click handler to the fetch notes button
    $('#fetch-notes-button').on('click', function () {
      fetchClinicalNotes();
    });

    // Attach submit handler to the clinical note form
    $('#clinical-note-form').on('submit', function (e) {
      e.preventDefault();
      submitClinicalNote();
    });
  });

  // Make fetchClinicalNotes available globally
  window.fetchClinicalNotes = function () {
    console.log('fetchClinicalNotes called');

    // Add logging for patient ID
    console.log('Patient ID:', window.smart.patient.id);

    // Query parameters to fetch DocumentReferences for the patient
    var query = {
      patient: window.smart.patient.id,
      type: 'http://loinc.org|34133-9' // LOINC code for Summarization of episode note
    };

    console.log('Query parameters:', query);

    // Fetch DocumentReference resources
    window.smart.api.search({
      type: 'DocumentReference',
      query: query
    }).then(function (response) {
      console.log('API Response:', response);

      if (response.entry && response.entry.length > 0) {
        console.log('Fetched Notes:', response.entry.map(entry => ({
          date: entry.resource.created,
          content: decodeBase64Content(entry.resource.content[0].attachment.data)
        })));

        $('#notes-list').empty(); // Clear existing list
        response.entry.forEach(function (entry) {
          var doc = entry.resource;

          // Decode the content if it exists
          var content = '';
          if (doc.content && doc.content[0] && doc.content[0].attachment && doc.content[0].attachment.data) {
            content = decodeBase64Content(doc.content[0].attachment.data);
          }

          // Format the date
          var date = doc.created ? new Date(doc.created).toLocaleString() : 'No Date';

          // Create list item with expandable content
          var listItem = $('<li>')
            .append($('<strong>').text(date))
            .append($('<br>'))
            .append($('<pre>').text(content))
            .append($('<hr>'));

          $('#notes-list').append(listItem);
        });
        $('#clinical-notes-list').show();
      } else {
        console.log('No clinical notes found');
        $('#notes-list').html('<li>No clinical notes found.</li>');
        $('#clinical-notes-list').show();
      }
    }).catch(function (error) {
      console.error('Error fetching clinical notes:', error);
      $('#errors').html('<p>Error fetching clinical notes. Please try again.</p>');
    });
  };

  // Helper function to decode base64 content
  function decodeBase64Content(base64Content) {
    try {
      return decodeURIComponent(escape(atob(base64Content)));
    } catch (e) {
      console.error('Error decoding content:', e);
      return 'Error decoding content';
    }
  }
  ///TESTING CODE ^^^^^



})(window);