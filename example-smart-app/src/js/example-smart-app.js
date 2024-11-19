(function (window) {
  /**
   * Initializes the SMART on FHIR client and fetches provider and patient data.
   * Structures the data similarly to the tutorial's extractData function.
   * @returns {Promise} A promise that resolves with the fetched data or rejects on error.
   */
  window.extractData = function () {
    var ret = $.Deferred();

    /**
     * Error handler for data extraction failures.
     */
    function onError() {
      console.error('Loading error', arguments);
      ret.reject();
    }

    /**
     * Success handler when the SMART client is ready.
     * Fetches provider and patient data.
     * @param {Object} smart - The SMART on FHIR client instance.
     */
    function onReady(smart) {
      console.log('SMART object initialized:', smart);
      console.log('Access Token:', smart.tokenResponse.access_token);
      // Check if the SMART client has patient context
      if (smart.hasOwnProperty('patient')) {
        var patient = smart.patient;

        // Fetch provider (Practitioner) information
        var providerInfo = smart.user.read();

        // Fetch patient information
        var patientInfo = patient.read();

        // Handle both provider and patient data
        $.when(providerInfo, patientInfo).fail(onError);

        $.when(providerInfo, patientInfo).done(function (provider, patient) {
          // Structure the fetched data
          var data = {
            provider: {
              name: provider.name[0].text ||
                `${provider.name[0].given.join(' ')} ${provider.name[0].family}`,
              id: provider.id,
            },
            patient: {
              name: patient.name[0].text ||
                `${patient.name[0].given.join(' ')} ${patient.name[0].family}`,
              id: patient.id,
            },
          };

          // Store the Practitioner ID globally for later use
          window.practitionerId = provider.id;

          // Optionally, store Patient ID globally if needed elsewhere
          window.patientId = patient.id;

          // Resolve the deferred object with the fetched data
          ret.resolve(data);
        });
      } else {
        // If patient context is not available, trigger error handler
        onError();
      }
    }

    /**
     * Initialize the SMART on FHIR client.
     * The client is ready when the OAuth2 process is complete.
     */
    FHIR.oauth2.ready(onReady, onError);

    // Return the promise to allow asynchronous handling
    return ret.promise();
  };

  /**
   * Fetches eConsults based on user action.
   */
  window.fetchEConsults = function () {
    if (!window.smart || !window.practitionerId) {
      console.error("SMART client or practitioner ID is not initialized.");
      $('#errors').html('<p>Error: Cannot fetch eConsults. Please try again.</p>');
      return;
    }

    const role = window.smart.state.role || 'pcp';
    const query = role === 'pcp' ? {
      requester: `Practitioner/${window.practitionerId}`,
      status: 'active'
    } : {
      performer: `Practitioner/${window.practitionerId}`,
      status: 'active'
    };

    window.smart.api
      .search({
        type: 'ServiceRequest',
        query
      })
      .then((response) => {
        const econsults = response.entry ?
          response.entry.map((entry) => entry.resource) : [];
        window.renderEConsults(econsults);
      })
      .catch((error) => {
        console.error("Error fetching eConsults:", error);
        $('#errors').html('<p>Error fetching eConsults. Please try again.</p>');
      });
  };

  /**
   * Renders the eConsult list.
   * @param {Array} econsults - The list of eConsults.
   */
  window.renderEConsults = function (econsults) {
    const $list = $('#econsults-ul').empty();

    if (econsults.length > 0) {
      econsults.forEach((econsult) => {
        const date = econsult.authoredOn ?
          new Date(econsult.authoredOn).toLocaleString() :
          "No Date";
        const content = econsult.note?. [0]?.text || "No Content";
        $list.append(`<li><strong>${date}:</strong> ${content}</li>`);
      });
    } else {
      $list.append("<li>No eConsults found.</li>");
    }

    $('#econsults-list').show();
  };

  /**
   * Draws basic patient and provider information.
   * @param {Object} data - The data to display.
   */
  window.drawVisualization = function (data) {
    $('#holder').show();
    $('#loading').hide();
    $('#provider-name').text(data.provider.name);
    $('#practitioner-id').text(data.provider.id);
    $('#patient-name').text(data.patient.name);
    $('#patient-id').text(data.patient.id);

    $('#fetch-econsults-button').show().on('click', window.fetchEConsults);
  };
})(window);