(function (window) {
  window.extractData = function () {
    var ret = $.Deferred();

    function onError(error) {
      console.error('Loading error:', error);
      ret.reject();
    }

    function onReady(smart) {
      window.smart = smart;
      console.log('SMART object initialized:', smart);

      // Log authentication details
      if (smart.server.auth && smart.server.auth.token) {
        console.log('Bearer Token:', smart.server.auth.token);
        console.log('Token Type:', smart.server.auth.type);
      }

      // Log user/provider details
      if (smart.user) {
        console.log('User Info:', {
          id: smart.user.id,
          resourceType: smart.user.resourceType,
          fhirUser: smart.tokenResponse.fhirUser
        });
      }

      // Log patient context if available
      if (smart.patient) {
        console.log('Patient Context:', {
          id: smart.patient.id,
          api: smart.patient.api
        });
      }

      // Fetch Provider Information
      var provider = smart.user;
      var providerInfo = provider.read();

      // Fetch Patient Information
      var patient = smart.patient;
      var patientInfo = patient.read();

      // Wait for provider and patient info only
      $.when(providerInfo, patientInfo).fail(onError);

      $.when(providerInfo, patientInfo).done(function (providerResponse, patientResponse) {
        console.log('Provider Response:', providerResponse);
        console.log('Patient Response:', patientResponse);

        // Process Patient Information
        var patientName = patientResponse.name ?
          (Array.isArray(patientResponse.name) ?
            (patientResponse.name[0].text ||
              (patientResponse.name[0].given ? patientResponse.name[0].given.join(' ') : '') +
              ' ' +
              (patientResponse.name[0].family || '')) :
            patientResponse.name) :
          "Patient";
        var patientId = patientResponse.id ? patientResponse.id : "N/A";
        console.log("Patient Name:", patientName);
        console.log("Patient ID:", patientId);

        // Process Provider Information
        var providerName = providerResponse.name ?
          (Array.isArray(providerResponse.name) ?
            (providerResponse.name[0].text ||
              (providerResponse.name[0].given ? providerResponse.name[0].given.join(' ') : '') +
              ' ' +
              (providerResponse.name[0].family || '')) :
            providerResponse.name) :
          "Provider";
        var practitionerId = providerResponse.id ? providerResponse.id : "N/A";

        console.log('Processed Provider Details:', {
          name: providerName,
          id: practitionerId,
          resourceType: providerResponse.resourceType,
          active: providerResponse.active
        });

        // Create Data Structure
        var data = {
          provider: {
            name: providerName,
            id: practitionerId
          },
          patient: {
            name: patientName,
            id: patientId
          }
        };

        ret.resolve(data);
      });
    }

    FHIR.oauth2.ready(onReady, onError);
    return ret.promise();
  };

  window.drawVisualization = function (data) {
    $('#holder').show();
    $('#loading').hide();

    // Display Provider Information
    $('#provider-name').html(data.provider.name);
    $('#practitioner-id').html(data.provider.id);

    // Display Patient Information
    $('#patient-name').html(data.patient.name);
    $('#patient-id').html(data.patient.id);

    // Assign the correct Practitioner ID
    window.practitionerId = data.provider.id;

    console.log("Assigned Practitioner ID:", window.practitionerId);

    // Initialize empty eConsults list
    $('#econsults-list').hide();
    $('#econsults-ul').empty();
  };

  window.submitEConsult = function () {
    var specialty = $('#specialty').val().trim();
    var condition = $('#condition').val().trim();
    var clinicalQuestion = $('#clinical-question').val().trim();
    var additionalInfo = $('#additional-info').val().trim();

    console.log('Submitting eConsult:', {
      specialty: specialty,
      condition: condition,
      clinicalQuestion: clinicalQuestion,
      additionalInfo: additionalInfo
    });

    // Validate required fields
    if (!specialty || !condition || !clinicalQuestion) {
      $('#error-messages').html('<p>Please fill in all required fields.</p>');
      return;
    }

    // Ensure Practitioner ID is set
    if (!window.practitionerId) {
      console.error('Practitioner ID is not set.');
      $('#error-messages').html('<p>Provider information is missing. Please try again.</p>');
      return;
    }

    var documentReference = createEConsultDocumentReference(
      specialty, condition, clinicalQuestion, additionalInfo
    );

    window.smart.api.create({
      type: 'DocumentReference',
      body: documentReference // **Use 'body' instead of 'resource'**
    }).then(function (response) {
      $('#feedback-message').text('eConsult submitted successfully!');
      $('#feedback').show();
      $('#error-messages').hide();
      $('#econsult-form')[0].reset();
      fetchEConsults();
    }).fail(function (error) { // Changed from .catch to .fail
      console.error('Error submitting eConsult:', error);
      $('#error-messages').html('<p>Error submitting eConsult. Please try again.</p>');
      $('#feedback').hide();
    });
  };

  function createEConsultDocumentReference(specialty, condition, clinicalQuestion, additionalInfo) {
    // Create plain text content for the clinical note
    var clinicalNoteContent = `
      eConsult Submission:
      Specialty: ${specialty}
      Condition: ${condition}
      Clinical Question: ${clinicalQuestion}
      Additional Information: ${additionalInfo}
    `;

    // Encode the content in base64
    var encodedContent = btoa(unescape(encodeURIComponent(clinicalNoteContent)));

    var docRef = {
      resourceType: 'DocumentReference',
      status: 'current',
      type: {
        coding: [{
          system: 'http://loinc.org',
          code: '34133-9',
          display: 'Summarization of episode note'
        }]
      },
      category: [{
        coding: [{
          system: 'http://hl7.org/fhir/document-category',
          code: 'referral',
          display: 'Referral'
        }]
      }],
      subject: {
        reference: 'Patient/' + window.smart.patient.id
      },
      author: [{
        reference: 'Practitioner/' + window.practitionerId // **Using the correctly set Practitioner ID**
      }],
      date: new Date().toISOString(), // Optional: Include the date of the document
      content: [{
        attachment: {
          contentType: 'text/plain', // Reflects the type of content
          data: encodedContent,
          title: 'eConsult Request'
        }
      }]
    };

    // Add encounter context if available
    if (window.smart.encounter && window.smart.encounter.id) {
      docRef.context = {
        encounter: [{
          reference: 'Encounter/' + window.smart.encounter.id
        }]
      };
    }

    return docRef;
  }

  window.fetchEConsults = function () {
    if (!window.smart || !window.smart.api) {
      console.error('Smart or Smart.api is undefined');
      $('#errors').html('<p>SMART object is not initialized properly.</p>');
      return;
    }

    if (!window.practitionerId) {
      console.error('Practitioner ID is not set');
      $('#errors').html('<p>Provider information is missing. Please try again.</p>');
      return;
    }

    var query = {
      'author': 'Practitioner/' + window.practitionerId, // **Use the correct Practitioner reference**
      'type': 'http://loinc.org|34133-9'
    };

    window.smart.api.search({
      type: 'DocumentReference',
      query: query
    }).then(function (response) {
      $('#errors').empty(); // Clear any existing errors
      if (response.entry && response.entry.length > 0) {
        $('#econsults-ul').empty();
        response.entry.forEach(function (entry) {
          var doc = entry.resource;
          var content = doc.content && doc.content[0] &&
            doc.content[0].attachment && doc.content[0].attachment.data ?
            decodeBase64Content(doc.content[0].attachment.data) :
            "No Content";
          var date = doc.date ?
            new Date(doc.date).toLocaleString() : 'No Date';

          var listItem = $('<li>')
            .append($('<strong>').text("Submitted on: " + date))
            .append($('<p>').text(content))
            .append($('<hr>'));

          $('#econsults-ul').append(listItem);
        });
        $('#econsults-list').show();
      } else {
        $('#econsults-ul').html('<li>No eConsults found.</li>');
        $('#econsults-list').show();
      }
    }).fail(function (error) {
      console.error('Error fetching eConsults:', error);
      $('#errors').html('<p>Error fetching eConsults. Please try again.</p>');
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

  // Initialize event handlers on document ready
  $(document).ready(function () {
    $('#fetch-econsults-button').on('click', fetchEConsults);
    $('#econsult-form').on('submit', function (e) {
      e.preventDefault();
      submitEConsult();
    });
  });
})(window);