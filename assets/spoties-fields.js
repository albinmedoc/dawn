const toBase64 = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = (error) => reject(error);
    });

const imgUrlToBase64 = (url) =>
    new Promise((resolve, reject) => {
        var xhr = new XMLHttpRequest();
        xhr.onload = () => {
            toBase64(xhr.response).then((res) => resolve(res));
        };
        xhr.onerror = (error) => reject(error);
        xhr.open('GET', url, true);
        xhr.responseType = 'blob';
        xhr.send();
    });

class SpotiesSearch extends HTMLElement {
    constructor() {
        super();

        this.search_field = this.querySelector('input[type="text"]');
        this.search_type_field = this.querySelector('select');
        this.spotify_uri_field = this.querySelector('input[type="hidden"]');
        this.search_results_container = this.querySelector('.search__results__container');
        this.search_results = this.search_results_container.querySelector('div');
        this.load_more_btn = this.search_results_container.querySelector('button');
        this.spotify_code = this.querySelector('#spoties-spotify-code');

        this.errors = this.querySelector('spoties-option-errors');

        this.timeout = null;
        this.loading = false;

        this.search_field.addEventListener('keyup', () => {
            clearTimeout(this.timeout);
            this.timeout = setTimeout(() => {
                this.onSearch();
            }, 500);
        });

        this.load_more_btn.addEventListener('click', () => this.onLoadMore());
    }

    validate() {
        this.errors.clear();
        let valid = true;
        if (this.hasAttribute('required')) {
            valid = this.spotify_uri_field.value !== '';
            if (!valid) {
                this.errors.add('Var vänlig och välj en låt')
            }
        }
        return valid;
    }

    removeErrors() {
        this.errors.clear();
    }

    clearResults() {
        while (this.search_results.firstChild) {
            this.search_results.removeChild(this.search_results.lastChild);
        }
    }

    onSearch() {
        const search = this.search_field.value;
        if (this.loading || search.trim() === '') {
            return;
        }
        this.clearResults();
        this.getResults(search).then(results => this.showResults(results));
    }

    onLoadMore() {
        const search = this.search_field.value;
        if (this.loading || search.trim() === '') {
            return;
        }
        const offset = this.search_results.childElementCount;
        this.getResults(search, offset).then(results => this.showResults(results));
    }

    getToken() {
        return fetch("https://ai.soufeel.com/spotify/tokens")
            .then((response) => response.json())
            .then(response => response.token);
    }

    getResults(search, offset = 0) {
        return this.getToken()
            .then((token) => {
                const type = this.search_type_field.value;
                const url = `https://api.spotify.com/v1/search?q=${search}&offset=${offset}&limit=5&type=${type}&market=SE`;
                return fetch(url, {
                    headers: new Headers({
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }),
                }).then((response) => response.json());
            });
    }

    showResults(results) {
        const items = results.tracks ? results.tracks.items : results.albums.items;
        items.forEach(item => {
            const album = item.album ? item.album : item;
            const name = item.name;
            const artists = album.artists
                .map((a) => a.name)
                .join(', ');
            const image = album.images[1].url;
            const uri = item.uri;

            const result = this.createSearchResult(image, name, artists);
            result.addEventListener('click', () => {
                const code_url = `https://scannables.scdn.co/uri/plain/png/ffffff/black/1080/${uri}`;
                imgUrlToBase64(code_url)
                    .then((code_img) => {
                        this.spotify_code.src = code_img;
                        this.spotify_uri_field.value = uri;
                    })
                    .finally(() => {
                        this.search_results_container.style.display = "none";
                        this.dispatchEvent(new CustomEvent('resClick', {
                            detail: {
                                name,
                                artists,
                                image,
                                uri
                            }
                        }));
                    });
            });
            this.search_results.append(result);
            this.search_results_container.style.display = "block";
        });
    }

    createSearchResult(image, name, artists) {
        const div = document.createElement('div');
        div.innerHTML = `<img src="${image}"><div><p>${name}</p><p>${artists}</p></div>`;
        return div;
    }
}

if (!customElements.get('spoties-search-field')) {
    customElements.define('spoties-search-field', SpotiesSearch);
}

class SpotiesCoverImage extends HTMLElement {
    constructor() {
        super();

        this.spoties_fields = this.closest('spoties-fields');
        this.cover_data_field = this.querySelector('input[type="hidden"]');
        this.cover_upload_field = this.querySelector('input[type="file"]');
        this.cover_image = this.querySelector('.spoties__option img');

        this.modal = this.querySelector('.spoties__cover__modal');
        this.modal_image = this.modal.querySelector('img');
        this.modal_save = this.modal.querySelector('label');

        this.errors = this.querySelector('spoties-option-errors');

        this.cropper = null;

        this.spoties_fields.addEventListener('spotiesSelected', (event) => {
            imgUrlToBase64(event.detail.image).then((image) => {
                this.setCoverImage(image);
            });
        });

        this.cover_upload_field.addEventListener('change', (event) => { this.uploadFile(event.target.files[0]) });

        this.modal_save.addEventListener('click', () => this.onSave());
    }

    validate() {
        this.errors.clear();
        const valid = this.cover_data_field.value !== '';
        if (!valid) {
            this.errors.add('Var vänlig och ange en omslagsbild')
        }
        return valid;
    }

    uploadFile(file) {
        toBase64(file).then((image) => {
            this.modal_image.src = image;
            this.modal.style.display = "block";
            this.cropper = new Cropper(this.modal_image, {
                aspectRatio: 1,
                viewMode: 1,
            });
        });
    }

    onSave() {
        const image = this.cropper.getCroppedCanvas({
            maxWidth: 1920,
            maxHeight: 1920,
        })
            .toDataURL('image/jpeg');
        this.cropper.destroy();
        this.setCoverImage(image);
        this.modal.style.display = "none";
    }

    setCoverImage(image) {
        this.cover_data_field.value = image;
        this.cover_image.src = image;
        this.cover_image.style.display = "block";
    }
}

if (!customElements.get('spoties-cover-image')) {
    customElements.define('spoties-cover-image', SpotiesCoverImage);
}

class SpotiesTextField extends HTMLElement {
    constructor() {
        super();
        this.input = this.querySelector('input');
        this.errors = this.querySelector('spoties-option-errors');
    }

    validate() {
        this.errors.clear();
        const length = this.input.value.length;

        const required_valid = this.hasAttribute('required') ? this.input.value.trim() !== '' : true;
        const min_valid = this.hasAttribute('minlength') ? length >= parseInt(this.getAttribute('minlength')) : true;
        const max_valid = this.hasAttribute('maxlength') ? length <= parseInt(this.getAttribute('maxlength')) : true;

        if (!required_valid && min_valid) {
            this.errors.add('Var vänlig och ange')
        }
        if (!min_valid) {
            this.errors.add(`Var vänlig och ange minst ${this.getAttribute('minlength')} tecken`)
        }
        if (!max_valid) {
            this.errors.add(`Var vänlig och ange max ${this.getAttribute('maxlength')} tecken`)
        }
        return required_valid && min_valid && max_valid;
    }
}

if (!customElements.get('spoties-text-field')) {
    customElements.define('spoties-text-field', SpotiesTextField);
}

class SpotiesRecordField extends SpotiesTextField {
    constructor() {
        super();

        this.spoties_fields = this.closest('spoties-fields');
        this.update_value = 'name';

        this.spoties_fields.addEventListener('spotiesSelected', (event) => {
            this.input.value = event.detail[this.update_value];
        });
    }
}

if (!customElements.get('spoties-record-name-field')) {
    customElements.define('spoties-record-name-field', SpotiesRecordField);
}

class SpotiesArtistField extends SpotiesRecordField {
    constructor() {
        super();
        this.update_value = 'artists';
    }
}

if (!customElements.get('spoties-artist-field')) {
    customElements.define('spoties-artist-field', SpotiesArtistField);
}

class SpotiesOptionErrors extends HTMLElement {
    clear() {
        while (this.firstChild) {
            this.removeChild(this.lastChild);
        }
    }

    add(message) {
        const error = document.createElement('div');
        error.innerHTML = message;
        error.addEventListener('click', () => this.removeChild(error));
        this.appendChild(error);
    }
}

if (!customElements.get('spoties-option-errors')) {
    customElements.define('spoties-option-errors', SpotiesOptionErrors);
}

class SpotiesFields extends HTMLElement {
    constructor() {
        super();

        const search_field = this.querySelector('spoties-search-field');

        if (search_field) {
            search_field.addEventListener('resClick', (event) => {
                this.dispatchEvent(new CustomEvent('spotiesSelected', { detail: event.detail }));
            });
        }
    }

    validate() {
        let results = [];
        this.children.forEach((field) => {
            results.push(field.validate());
        });
        return results.every(Boolean);;
    }
}

if (!customElements.get('spoties-fields')) {
    customElements.define('spoties-fields', SpotiesFields);
}