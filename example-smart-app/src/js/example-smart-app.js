(function (window) {
  window.extractData = function () {
    var ret = $.Deferred();

    function onError() {
      console.log('Loading error', arguments);
      ret.reject();
    }

    function onReady(smart) {
      window.smart = smart;
      console.log('SMART object initialized:', smart);

      // Fetch Provider Information
      var provider = smart.user;
      var providerInfo = provider.read();

      // Fetch Provider's eConsults (DocumentReferences)
      var econsults = smart.api.search({
        type: 'DocumentReference',
        query: {
          'author': 'Practitioner/' + smart.user.id,
          'type': 'http://loinc.org|34133-9'
        }
      });

      $.when(providerInfo, econsults).fail(onError);

      $.when(providerInfo, econsults).done(function (providerResponse, econsultsResponse) {
        // Process provider information
        var providerName = providerResponse.name ? providerResponse.name : "Provider";
        var practitionerId = providerResponse.id ? providerResponse.id : "N/A";

        // Process eConsult list
        var econsultList = econsultsResponse.entry ?
          econsultsResponse.entry.map(entry => entry.resource) : [];

        // Create data structure
        var data = {
          provider: {
            name: providerName,
            id: practitionerId
          },
          econsults: econsultList
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

    // Display eConsults List
    var $econsultsList = $('#econsults-ul');
    $econsultsList.empty();

    if (data.econsults.length > 0) {
      data.econsults.forEach(function (econsult) {
        var content = econsult.content && econsult.content[0] &&
          econsult.content[0].attachment && econsult.content[0].attachment.data ?
          decodeBase64Content(econsult.content[0].attachment.data) :
          "No Content";

        var date = econsult.created ?
          new Date(econsult.created).toLocaleString() : 'No Date';

        var listItem = $('<li>')
          .append($('<strong>').text("Submitted on: " + date))
          .append($('<p>').text(content))
          .append($('<hr>'));

        $econsultsList.append(listItem);
      });
      $('#econsults-list').show();
    } else {
      $econsultsList.html('<li>No eConsults found.</li>');
      $('#econsults-list').show();
    }
  };

  window.submitEConsult = function () {
    var specialty = $('#specialty').val();
    var condition = $('#condition').val();
    var clinicalQuestion = $('#clinical-question').val();
    var additionalInfo = $('#additional-info').val();

    console.log('Submitting eConsult:', {
      specialty: specialty,
      condition: condition,
      clinicalQuestion: clinicalQuestion,
      additionalInfo: additionalInfo
    });

    if (!specialty || !condition || !clinicalQuestion) {
      $('#error-messages').html('<p>Please fill in all required fields.</p>');
      return;
    }

    var documentReference = createEConsultDocumentReference(
      specialty, condition, clinicalQuestion, additionalInfo
    );

    window.smart.api.create({
      resourceType: 'DocumentReference',
      body: documentReference
    }).then(function (response) {
      $('#feedback-message').text('eConsult submitted successfully!');
      $('#feedback').show();
      $('#error-messages').hide();
      $('#econsult-form')[0].reset();
      fetchEConsults();
    }).catch(function (error) {
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
        reference: 'Practitioner/' + window.smart.user.id
      }],
      date: new Date().toISOString(),
      content: [{
        attachment: {
          contentType: 'text/plain',
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

  $(document).ready(function () {
    $('#fetch-econsults-button').on('click', function () {
      fetchEConsults();
    });

    $('#econsult-form').on('submit', function (e) {
      e.preventDefault();
      submitEConsult();
    });
  });

  window.fetchEConsults = function () {
    if (!window.smart || !window.smart.api) {
      console.error('Smart or Smart.api is undefined');
      $('#errors').html('<p>SMART object is not initialized properly.</p>');
      return;
    }

    var query = {
      'author': 'Practitioner/' + window.smart.user.id,
      'type': 'http://loinc.org|34133-9'
    };

    window.smart.api.search({
      type: 'DocumentReference',
      query: query
    }).then(function (response) {
      if (response.entry && response.entry.length > 0) {
        $('#econsults-ul').empty();
        response.entry.forEach(function (entry) {
          var doc = entry.resource;
          var content = doc.content && doc.content[0] &&
            doc.content[0].attachment && doc.content[0].attachment.data ?
            decodeBase64Content(doc.content[0].attachment.data) :
            "No Content";
          var date = doc.created ?
            new Date(doc.created).toLocaleString() : 'No Date';

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
    }).catch(function (error) {
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
})(window);